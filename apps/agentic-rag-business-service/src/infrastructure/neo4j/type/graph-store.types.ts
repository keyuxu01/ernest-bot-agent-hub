import type { DocumentAccessScope } from '../../../common/type/document-access.types';

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
  teamId?: string | null;
  isPublic?: boolean;
  status: number;
  /** 逗号分隔的文档标签，用于全景图生成标签节点 */
  tags?: string | null;
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

/** GET /graph/nodes 返回的实体节点 */
type GraphNodeVO = {
  /** 实体名（实体按 name 唯一） */
  id: string;
  name: string;
  type: string | null;
  description: string | null;
};

/** GET /graph/edges 返回的实体关系边 */
type GraphEdgeVO = {
  /** 起点实体名 */
  source: string;
  /** 终点实体名 */
  target: string;
  relation: string;
  /** 证据强度 0-1，缺失时为 0.5 */
  weight: number;
};

/** GET /graph/overview 的过滤参数 */
type GraphOverviewParams = {
  keyword?: string;
  entityType?: string;
  /** 文档 updatedAt 下界，ISO 字符串 */
  from?: string;
  /** 文档 updatedAt 上界，ISO 字符串 */
  to?: string;
  docLimit?: number;
  /** 当前用户文档可见范围 */
  scope?: DocumentAccessScope;
};

type GraphOverviewNodeKind = 'document' | 'entity' | 'tag';
type GraphOverviewEdgeKind = 'mentions' | 'related' | 'tagged';

type GraphOverviewNode = {
  id: string;
  name: string;
  kind: GraphOverviewNodeKind;
  type?: string | null;
  documentId?: string | null;
  updatedAt?: string | null;
  description?: string | null;
};

type GraphOverviewEdge = {
  source: string;
  target: string;
  relation: string;
  kind: GraphOverviewEdgeKind;
};

type GraphOverviewResponse = {
  nodes: GraphOverviewNode[];
  edges: GraphOverviewEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    documentCount: number;
    entityCount: number;
    tagCount: number;
    mentionCount: number;
    relatedCount: number;
    entityTypes: Array<{ type: string; count: number }>;
  };
  topEntities: Array<{ name: string; type: string | null; degree: number }>;
  recentNodes: Array<{
    id: string;
    name: string;
    kind: string;
    updatedAt: string | null;
  }>;
  entityTypes: string[];
};

/** GET /graph/search 返回的命中节点（实体 / 文档 / 块） */
type GraphSearchHitVO = {
  id: string;
  name: string;
  /** 节点类型：KnowledgeEntity / KnowledgeDocument / DocumentChunk */
  label: string | null;
  type: string | null;
  title: string | null;
  description: string | null;
  heading: string | null;
  documentId: string | null;
  summary: string | null;
  /** 块正文前 160 字 */
  snippet: string | null;
};

export type {
  GraphChunkNode,
  GraphDocumentNode,
  GraphEdgeVO,
  GraphEntity,
  GraphExtraction,
  GraphNodeVO,
  GraphOverviewEdge,
  GraphOverviewEdgeKind,
  GraphOverviewNode,
  GraphOverviewNodeKind,
  GraphOverviewParams,
  GraphOverviewResponse,
  GraphRelation,
  GraphSearchHitVO,
};
