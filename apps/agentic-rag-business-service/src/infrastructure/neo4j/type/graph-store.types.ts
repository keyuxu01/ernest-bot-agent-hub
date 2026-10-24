/**
 * 图谱写入所需的最小结构。
 *
 * 基础设施只认这些形状，不依赖 pipeline 的 PipelineDocument / DocumentChunk，
 * 与 elasticsearch/type/indexable-chunk.types.ts 的分层方式一致。
 */

/** (:KnowledgeDocument) 节点属性；id 为 PostgreSQL 雪花 ID 字符串 */
type GraphDocumentNode = {
  id: string;
  title: string;
  summary?: string | null;
  categoryId?: string | null;
  authorId?: string | null;
  status: number;
};

/**
 * (:DocumentChunk) 节点属性。
 * chunkId 与 ES `kh_chunk` 同源（sha256(documentId:index)），便于 RAG 与图谱互查。
 */
type GraphChunkNode = {
  chunkId: string;
  documentId: string;
  content: string;
  heading?: string | null;
  chunkIndex: number;
  totalChunks: number;
};

/** 图谱实体（如「财务部」「发布流程」），按 name 跨文档复用同一节点 */
type GraphEntity = {
  name: string;
  /** 已规范化的实体类型（PERSON / ORGANIZATION / CONCEPT …） */
  type: string;
  description?: string;
  aliases?: string[];
};

/** 实体间关系：source -[RELATED_TO {relation}]-> target */
type GraphRelation = {
  source: string;
  target: string;
  /** 已规范化的关系类型（HAS_PART / REQUIRES / RELATED_TO …） */
  relation: string;
  /**
   * LLM 按 prompt 打分标准给出的单块证据强度 0-1。
   * 落边时与已有值取最大值；跨块出现次数另记在边的 chunkIds / mentions 上。
   */
  weight?: number;
};

/** 单个 chunk 的抽取结果（对应源提交 ExtractionResult）；chunkId 用于建 MENTIONS */
type GraphExtraction = {
  chunkId?: string;
  entities: GraphEntity[];
  relations: GraphRelation[];
};

export type {
  GraphChunkNode,
  GraphDocumentNode,
  GraphEntity,
  GraphExtraction,
  GraphRelation,
};
