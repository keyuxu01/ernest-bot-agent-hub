/** kh_chunk 检索命中（关键词 / 向量 / RRF 融合 / rerank 后共用） */
type ChunkHit = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  /** 块正文（含补上的章节标题前缀） */
  content: string;
  heading: string | null;
  /** 当前阶段得分：原始检索分、RRF 分或 rerank 分 */
  score: number;
  /** 关键词（BM25）原始得分；没被关键词召回时为 0 */
  bm25Score?: number;
  /** 向量（kNN 余弦）原始得分；没被向量召回时为 0 */
  vectorScore?: number;
};

/** 混合检索粗排入参 */
type HybridSearchParams = {
  /** 用户问题原文，用于关键词检索 */
  query: string;
  /** 问题向量；为空时只走关键词 */
  queryVector?: number[] | null;
  /** 每一路召回条数，默认 20，限制 1-50 */
  hybridTopK?: number;
  /** RRF 平滑常数 C，默认 60 */
  rrfC?: number;
};

export type { ChunkHit, HybridSearchParams };
