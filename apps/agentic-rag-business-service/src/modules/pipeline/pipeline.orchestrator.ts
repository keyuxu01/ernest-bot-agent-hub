import type { RagBusinessSearchIndexMessageV1 } from '@repo/contracts';
import { SearchIndexService } from '../../infrastructure/elasticsearch/search-index.service';
import { Injectable, Logger } from '@nestjs/common';
import { VectorIndexService } from '../../infrastructure/elasticsearch/vector-index.service';
import { EmbeddingService } from '../../infrastructure/embedding/embedding.service';
import { DocumentContentRepository } from '../document/repository/document-content.repository';
import { DocumentRepository } from '../document/repository/document.repository';
import { ChunkingService } from './chunking.service';
import { GraphBuildService } from './graph-build.service';
import { toIsoDate } from './helpers/to-iso-date';
import { toPipelineDocument } from './helpers/to-pipeline-document';
import type { PipelineDocument } from './type/pipeline.types';

/**
 * 发布后知识管线编排器
 *
 * RAG：分块 → Embedding → ES kh_chunk。
 * KG：分块 → LLM 抽实体关系 → Neo4j（迁自 knowledge-hub-backend `bb867d5e`）。
 * 由 DocumentPipelineConsumer 在消费到 MQ 消息后调用；
 * 本类负责「加载文档 → 调具体服务」，不直接碰 RabbitMQ。
 */
@Injectable()
class PipelineOrchestrator {
  private readonly logger = new Logger(PipelineOrchestrator.name);

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly contentRepo: DocumentContentRepository,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorIndexService: VectorIndexService,
    private readonly searchIndexService: SearchIndexService,
    private readonly graphBuildService: GraphBuildService,
  ) {}

  /**
   * 处理 RAG 重建消息。
   *
   * 重建流水线（单文档）：清旧块 → Chunking → Embedding → 写入 ES kh_chunk
   */
  async handleRagReindex(type: string, documentIds?: string[]): Promise<void> {
    if (type === 'DELETE_BY_DOC_IDS' && documentIds?.length) {
      // 软删后不能再依赖 active 文档查询，直接按关联键清理向量块。
      for (const id of documentIds)
        await this.vectorIndexService.deleteByDocId(id);
      return;
    }
    if (type !== 'BY_DOC_IDS' || !documentIds?.length) {
      this.logger.warn(`忽略未支持的 RAG 消息：type=${type}`);
      return;
    }

    const docs = await this.loadDocumentsByIds(documentIds);
    this.logger.log(`RAG 开始索引：type=${type}, total=${docs.length}`);

    for (const doc of docs) {
      try {
        await this.reindexOne(doc);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`RAG 索引失败：documentId=${doc.id}, ${message}`);
      }
    }
  }

  /** Search 使用已校验快照；删除按 ES _id，异常交给 MQ 消费边界处理。 */
  async handleSearchIndex(
    message: RagBusinessSearchIndexMessageV1,
  ): Promise<void> {
    if (message.type === 'DELETE') {
      await this.searchIndexService.deleteDocument(message.documentId);
    } else {
      await this.searchIndexService.indexDocument(message.document);
    }
  }

  /**
   * 处理 KG 建图消息。
   *
   * - BY_DOC_IDS：读元数据 + 正文 → 分块 → 抽实体关系 → 写 Neo4j
   * - DELETE_BY_DOC_IDS：删文档节点、块与孤儿实体；软删后文档已不是 active，
   *   所以与 RAG 删除一样直接按 ID 清理，不再查库
   *
   * 单篇失败只记日志，与 RAG 一致（消息仍会 ack）；删除失败向上抛，交给 MQ 边界 nack。
   * 源提交的 BUILD_ALL 未迁入：v1 契约不包含该类型。
   */
  async handleKgBuild(type: string, documentIds?: string[]): Promise<void> {
    // 两种类型都按 ID 处理，空列表与未知类型同样忽略
    if (!documentIds?.length) {
      this.logger.warn(`忽略未支持的 KG 消息：type=${type}`);
      return;
    }

    switch (type) {
      case 'DELETE_BY_DOC_IDS': {
        for (const id of documentIds)
          await this.graphBuildService.deleteForDocument(id);
        return;
      }
      case 'BY_DOC_IDS': {
        const docs = await this.loadDocumentsByIds(documentIds);
        this.logger.log(`KG 开始建图：type=${type}, total=${docs.length}`);
        for (const doc of docs) {
          try {
            await this.graphBuildService.buildForDocument(doc);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(`KG 构建失败：documentId=${doc.id}, ${message}`);
          }
        }
        return;
      }
      default:
        this.logger.warn(`忽略未支持的 KG 消息：type=${type}`);
    }
  }

  /** 单篇：分块 → 批量嵌入 → 落库 */
  private async reindexOne(doc: PipelineDocument): Promise<void> {
    if (!doc.content?.trim()) {
      this.logger.warn(`文档内容为空，跳过 RAG：documentId=${doc.id}`);
      return;
    }

    // 先清旧块，避免重复发布时脏数据残留
    await this.vectorIndexService.deleteByDocId(doc.id);

    const chunks = await this.chunkingService.chunk({
      content: doc.content,
      documentId: doc.id,
      documentTitle: doc.title,
      categoryId: doc.categoryId,
      authorId: doc.authorId,
      teamId: doc.teamId,
      docStatus: doc.status,
      publishTime: toIsoDate(doc.publishTime),
    });

    if (!chunks.length) {
      return;
    }

    const embeddings = await this.embeddingService.embedBatch(
      chunks.map((chunk) => chunk.content),
    );
    chunks.forEach((chunk, index) => {
      chunk.embedding = embeddings[index];
    });

    await this.vectorIndexService.indexChunks(chunks);
    this.logger.log(
      `RAG 索引完成：documentId=${doc.id}, chunks=${chunks.length}`,
    );
  }

  /** 按 ID 列表加载元数据 + Mongo 正文 */
  private async loadDocumentsByIds(ids: string[]): Promise<PipelineDocument[]> {
    const docs = await this.documentRepo.findActiveByIds(ids);
    const result: PipelineDocument[] = [];

    for (const doc of docs) {
      const contentDoc = await this.contentRepo.findActiveContentById(
        doc.contentId,
      );
      result.push(toPipelineDocument(doc, contentDoc?.content ?? ''));
    }

    return result;
  }
}

export { PipelineOrchestrator };
