/** 写入 ES `kh_document` 的整篇文档（Postgres 元数据 + Mongo 全文） */
type SearchIndexDocument = {
  id: string;
  title: string;
  summary: string | null;
  /** Mongo 全文，不截断 */
  content: string;
  categoryId: string | null;
  tags: string | null;
  status: number;
  isPublic?: boolean;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  authorId: string | null;
  publishTime: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** 关键词检索入参 */
type SearchDocumentsParams = {
  keyword: string;
  /** 页码，从 1 开始，默认 1 */
  page?: number;
  /** 每页条数，默认 10，最大 50 */
  pageSize?: number;
  categoryId?: string;
  authorId?: string;
};

/** 关键词检索的单条命中（不含正文，正文只以高亮片段返回） */
type SearchDocumentHit = {
  id: string;
  title: unknown;
  summary: unknown;
  categoryId: unknown;
  tags: unknown;
  authorId: unknown;
  status: unknown;
  publishTime: unknown;
  /** ES 相关度得分 */
  score: number;
  /** 命中片段，关键词用 <em> 包裹 */
  highlight: {
    title: string[];
    summary: string[];
    content: string[];
  };
};

/** 关键词检索结果（分页） */
type SearchDocumentsResult = {
  items: SearchDocumentHit[];
  total: number;
  page: number;
  pageSize: number;
};

export type {
  SearchDocumentHit,
  SearchDocumentsParams,
  SearchDocumentsResult,
  SearchIndexDocument,
};
