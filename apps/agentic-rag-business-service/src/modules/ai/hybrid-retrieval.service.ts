import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { accessFromUser } from '../document/helpers/document-access';
import type { AuthUser } from '../user/type/user.types';
import type { ChunkHit } from '../../infrastructure/elasticsearch/type/chunk-hit.types';
import { VectorIndexService } from '../../infrastructure/elasticsearch/vector-index.service';
import { EmbeddingService } from '../../infrastructure/embedding/embedding.service';
import { RerankerService } from '../../infrastructure/rerank/reranker.service';

/**
 * kh_chunk 混合检索
 *
 * 问题向量化 → 关键词 + 向量两路召回 → RRF 粗融合 → reranker 精排 → 取前 topK。
 * 向量化失败只走关键词；rerank 失败按 RRF 顺序返回。
 *
 * 环境变量：`RAG_HYBRID_TOP_K`（每路召回数，缺省 20）、`RAG_RRF_C`（缺省 60）、
 * `RAG_MIN_SCORE`（rerank 相关度下限，缺省 0.4；RRF 降级时不生效）
 */
@Injectable()
class HybridRetrievalService {
  private readonly logger = new Logger(HybridRetrievalService.name);
  /** rerank relevance_score 下限（0-1） */
  private readonly minScore: number;
  private readonly hybridTopK: number;
  private readonly rrfC: number;

  /**
   * @description 注入向量化、ES 检索与重排客户端，读取召回参数
   * @param config ConfigService，读取 RAG_HYBRID_TOP_K / RAG_RRF_C
   * @param embedding EmbeddingService，把问题转成向量
   * @param vectorIndex VectorIndexService，kh_chunk 关键词 / 向量 / RRF 检索
   * @param reranker RerankerService，精排
   */
  constructor(
    config: ConfigService,
    private readonly embedding: EmbeddingService,
    private readonly vectorIndex: VectorIndexService,
    private readonly reranker: RerankerService,
  ) {
    this.hybridTopK = Number(config.get('RAG_HYBRID_TOP_K') ?? 20);
    this.rrfC = Number(config.get('RAG_RRF_C') ?? 60);
    this.minScore = Number(config.get('RAG_MIN_SCORE') ?? 0.4);
  }

  /**
   * @description 混合检索：召回 → RRF → rerank → 最低相关度过滤，返回最相关的 topK 块
   * @param query string，用户问题
   * @param topK number，最终返回条数，默认 5
   * @param user AuthUser | undefined，当前用户；不传时只检索公开文档
   * @returns Promise<ChunkHit[]>，精排成功时 score 为 rerank 分，否则为 RRF 分；没有命中返回 []
   */
  async retrieve(
    query: string,
    topK = 5,
    user?: AuthUser,
  ): Promise<ChunkHit[]> {
    // ① 问题向量化（失败为 null）
    const queryVector = await this.embedQuery(query);
    const scope = user
      ? accessFromUser(user)
      : { unrestricted: false, userId: '', teamIds: [] };
    // ② 关键词 + 向量召回，RRF 粗排
    const fused = await this.vectorIndex.searchHybrid({
      query,
      queryVector,
      hybridTopK: this.hybridTopK,
      rrfC: this.rrfC,
      scope,
    });
    if (!fused.length) {
      this.logger.log(`混合检索无结果：queryLength=${query.length}`);
      return [];
    }

    // ③ rerank 全部候选，再按相关度下限过滤并截取 topK。
    const reranked = await this.reranker.rerank(query, fused, fused.length);
    if (reranked?.length) {
      const kept =
        this.minScore > 0
          ? reranked.filter((hit) => hit.score >= this.minScore)
          : reranked;
      const top = kept.slice(0, topK);
      this.logger.log(
        `检索过滤：rerank=${reranked.length}, minScore=${this.minScore}, ` +
          `best=${reranked[0]?.score?.toFixed(3) ?? '-'}, kept=${kept.length}, return=${top.length}`,
      );
      return top;
    }
    // rerank 失败：按 RRF 顺序截取
    return fused.slice(0, topK);
  }

  /**
   * @description 问题向量化；失败只记日志并返回 null（调用方只走关键词）
   * @param query string，用户问题
   * @returns Promise<number[] | null>，问题向量，失败为 null
   */
  private async embedQuery(query: string): Promise<number[] | null> {
    try {
      return await this.embedding.embed(query);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`查询向量化失败，仅走关键词：${message}`);
      return null;
    }
  }
}

export { HybridRetrievalService };
