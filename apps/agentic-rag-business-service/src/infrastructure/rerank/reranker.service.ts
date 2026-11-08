import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChunkHit } from '../elasticsearch/type/chunk-hit.types';
import { RERANK_DOCUMENT_MAX_CHARS } from './constants/rerank.constants';
import type { DashScopeRerankResponse } from './type/rerank.types';

/**
 * 文本 reranker（DashScope text-rerank，默认模型 qwen3-rerank）
 *
 * 对 RRF 粗排后的候选块逐个打「与问题的相关性」分，比只看两路排名更准。
 * 不是 OpenAI 兼容接口（LangChain ChatOpenAI 只覆盖 chat / embeddings），所以直接 fetch。
 * 调用失败时返回 null，由上层降级为 RRF 顺序，不影响检索结果返回。
 *
 * 环境变量（启动时必填）：
 * - `QWEN_LLM_API_KEY`：与 Embedding / 对话模型共用
 * - `QWEN_RERANK_MODEL_NAME`：如 qwen3-rerank
 * - `QWEN_RERANK_URL`：完整接口地址（公共地址或百炼业务空间地址）
 */
@Injectable()
class RerankerService {
  private readonly logger = new Logger(RerankerService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;

  /**
   * @description 读取 Key、模型与接口地址
   * @param config ConfigService，环境变量
   */
  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('QWEN_LLM_API_KEY');
    this.model = config.getOrThrow<string>('QWEN_RERANK_MODEL_NAME');
    this.endpoint = config.getOrThrow<string>('QWEN_RERANK_URL');
  }
  /**
   * @description 按问题与候选块的相关性重排，取前 topN；接口报错、返回空结果或异常时返回 null
   * @param query string，用户问题
   * @param candidates ChunkHit[]，RRF 粗排后的候选块
   * @param topN number，最多返回条数（不超过候选数）
   * @returns Promise<ChunkHit[] | null>，按 rerank 分降序的块（score 换成 rerank 分）；候选为空返回 []；失败返回 null
   */
  async rerank(
    query: string,
    candidates: ChunkHit[],
    topN: number,
  ): Promise<ChunkHit[] | null> {
    if (!candidates.length) return [];
    // 每个候选块拼成一段文本，顺序与 candidates 一致（返回的 index 就是这里的下标）
    const documents = candidates.map((hit) => toRerankDocument(hit));
    try {
      // POST {QWEN_RERANK_URL}
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          // DashScope 用 Bearer Key 鉴权
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // 重排模型，如 qwen3-rerank
          model: this.model,
          // 一个问题 + 多段候选文本
          input: { query, documents },
          parameters: {
            // 不回传原文，只要下标和得分
            return_documents: false,
            // 只返回最相关的前 N 条，不超过候选数
            top_n: Math.min(topN, candidates.length),
          },
        }),
      });
      // 成功与失败都返回 JSON：成功时有 output.results，失败时有 code / message
      const body = (await response.json()) as DashScopeRerankResponse;
      // 非 2xx（Key 无效、限流、参数错等）：降级
      if (!response.ok) {
        this.logger.warn(
          `Rerank 调用失败：status=${response.status}, code=${body.code ?? ''}, message=${body.message ?? ''}`,
        );
        return null;
      }

      // 标准 DashScope 返回 output.results；兼容部分部署的顶层 results。
      const results = body.output?.results ?? body.results ?? [];
      if (!results.length) {
        this.logger.warn('Rerank 返回空结果，降级为 RRF');
        return null;
      }

      // 用返回的下标找回候选块，得分换成 rerank 分；越界下标丢弃
      const reranked = results
        .filter((item) => item.index >= 0 && item.index < candidates.length)
        .map((item) => ({
          ...candidates[item.index]!,
          score: item.relevance_score,
        }));
      this.logger.log(
        `Rerank 完成：model=${this.model}, in=${candidates.length}, out=${reranked.length}`,
      );
      return reranked;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Rerank 异常，降级为 RRF：${message}`);
      return null;
    }
  }
}

/**
 * @description 把候选块拼成送给 rerank 的文本：文档标题 + 章节标题 + 块正文，超长截断
 * @param hit ChunkHit，候选块
 * @returns string，最多 RERANK_DOCUMENT_MAX_CHARS 字（超出加 ...）
 */
function toRerankDocument(hit: ChunkHit): string {
  const heading = hit.heading ? `${hit.heading}\n` : '';
  const text = `${hit.documentTitle}\n${heading}${hit.content}`.trim();
  return text.length > RERANK_DOCUMENT_MAX_CHARS
    ? `${text.slice(0, RERANK_DOCUMENT_MAX_CHARS)}...`
    : text;
}

export { RerankerService };
