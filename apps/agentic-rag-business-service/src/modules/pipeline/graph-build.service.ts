import { Injectable, Logger } from '@nestjs/common';
import { GraphStoreService } from '../../infrastructure/neo4j/graph-store.service';
import { ChunkingService } from './chunking.service';
import { toIsoDate } from './helpers/to-iso-date';
import { KgExtractionService } from './kg-extraction.service';
import type { KgExtractionResult } from './type/kg-extraction.types';
import type { PipelineDocument } from './type/pipeline.types';

/**
 * KG 知识图谱构建（单篇文档）
 *
 * 迁自 knowledge-hub-backend `bb867d5e` GraphBuildService 的编排部分；
 * Cypher 写入下沉到 infrastructure/neo4j 的 GraphStoreService。
 *
 * 单篇构建步骤：
 * 1. 删除该文档旧图数据（先清再建，避免重复发布导致节点 / 边翻倍）
 * 2. upsert 文档节点
 * 3. 复用 RAG 同款 ChunkingService 分块，每块建 DocumentChunk + HAS_CHUNK
 *    （图谱块与 ES `kh_chunk` 同 chunkId）
 * 4. 逐块 LLM 抽取 → writeExtraction 写实体 / MENTIONS / RELATED_TO
 *
 * 边界：
 * - 单块抽取失败只记日志，块节点已落、实体为空，不阻断其余块（与源行为一致）
 * - 块节点与抽取结果分多条语句写入，不在同一事务（与源一致）；中途失败会留下部分数据，
 *   下次重新发布时先清再建可恢复
 * - Neo4j 写入失败向上抛出，由编排器按文档记录失败
 * - 逐块串行调用 LLM，长文档耗时 ≈ 块数 × 单次抽取耗时；并发度后续按配额再定
 */
@Injectable()
class GraphBuildService {
  private readonly logger = new Logger(GraphBuildService.name);

  constructor(
    private readonly chunkingService: ChunkingService,
    private readonly extractionService: KgExtractionService,
    private readonly graphStore: GraphStoreService,
  ) {}

  /** @returns 写入（或复用）的实体数（近似，仅用于日志） */
  async buildForDocument(doc: PipelineDocument): Promise<number> {
    if (!doc.content?.trim()) {
      this.logger.warn(`文档内容为空，跳过 KG：documentId=${doc.id}`);
      return 0;
    }

    // 先清再建，避免重复发布导致边/节点翻倍
    await this.graphStore.deleteByDocId(doc.id);
    await this.graphStore.upsertDocument({
      id: doc.id,
      title: doc.title,
      summary: doc.summary,
      categoryId: doc.categoryId,
      authorId: doc.authorId,
      status: doc.status,
      tags: doc.tags,
    });

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

    let totalEntities = 0;
    for (const chunk of chunks) {
      // ③ chunk 节点 + 文档→块边：Document -[HAS_CHUNK]-> Chunk
      await this.graphStore.upsertChunk({
        chunkId: chunk.chunkId,
        documentId: doc.id,
        content: chunk.content,
        heading: chunk.heading,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
      });

      // ④ 抽实体关系并落图；单块失败不阻断其余块（图已先清过）
      let extracted: KgExtractionResult;
      try {
        extracted = await this.extractionService.extract(
          chunk.content,
          chunk.heading,
          doc.title,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `KG 抽取失败，该块只落节点不落实体：documentId=${doc.id}, chunk=${chunk.chunkIndex}, ${message}`,
        );
        extracted = { entities: [], relations: [] };
      }

      // 绑定当前块，writeExtraction 才能建 MENTIONS；累加实体数仅用于日志
      totalEntities += await this.graphStore.writeExtraction({
        chunkId: chunk.chunkId,
        entities: extracted.entities,
        relations: extracted.relations,
      });
    }

    this.logger.log(
      `KG 图谱构建完成：documentId=${doc.id}, chunks=${chunks.length}, entities=${totalEntities}`,
    );
    return totalEntities;
  }

  /** 删除文档图谱；文档不存在时为空操作 */
  async deleteForDocument(documentId: string): Promise<void> {
    await this.graphStore.deleteByDocId(documentId);
  }
}

export { GraphBuildService };
