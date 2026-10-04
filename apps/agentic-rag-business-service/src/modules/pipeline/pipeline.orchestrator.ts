import { Injectable, Logger } from '@nestjs/common';
import { VectorIndexService } from '../../infrastructure/elasticsearch/vector-index.service';
import { EmbeddingService } from '../../infrastructure/embedding/embedding.service';
import { DocumentContentRepository } from '../document/repository/document-content.repository';
import { DocumentRepository } from '../document/repository/document.repository';
import { ChunkingService } from './chunking.service';
import { toIsoDate } from './helpers/to-iso-date';
import { toPipelineDocument } from './helpers/to-pipeline-document';
import type { PipelineDocument } from './type/pipeline.types';

/**
 * 发布后知识管线编排器
 *
 * RAG：分块 → Embedding → ES kh_chunk。
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
  ) {}

  /**
   * 处理 RAG 重建消息。
   *
   * 重建流水线（单文档）：清旧块 → Chunking → Embedding → 写入 ES kh_chunk
   */
  async handleRagReindex(
    type: string,
    documentIds?: string[],
  ): Promise<void> {
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
  private async loadDocumentsByIds(
    ids: string[],
  ): Promise<PipelineDocument[]> {
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
