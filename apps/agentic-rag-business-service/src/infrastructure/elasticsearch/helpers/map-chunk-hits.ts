import type { ChunkHit } from '../type/chunk-hit.types';

/** ES 返回的单条命中里本模块用到的字段 */
type EsChunkHit = {
  _id?: string;
  _score?: number | null;
  _source?: unknown;
};

/**
 * @description 把 ES kh_chunk 的命中（下划线字段）转成 ChunkHit（驼峰字段）
 * @param hits EsChunkHit[]，`response.hits.hits`
 * @returns ChunkHit[]，score 为 ES 原始得分（BM25 分或 kNN 相似度）
 */
function mapChunkHits(hits: EsChunkHit[]): ChunkHit[] {
  return hits.map((hit) => {
    const src = (hit._source ?? {}) as Record<string, unknown>;
    return {
      chunkId: String(src.chunk_id ?? hit._id),
      documentId: String(src.document_id ?? ''),
      documentTitle: String(src.document_title ?? ''),
      content: String(src.content ?? ''),
      heading: (src.heading as string | null) ?? null,
      score: hit._score ?? 0,
    };
  });
}

export { mapChunkHits };
