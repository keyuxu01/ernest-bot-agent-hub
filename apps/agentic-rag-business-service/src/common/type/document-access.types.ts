/** 当前用户可访问文档的范围，供 PostgreSQL、Elasticsearch 与 Neo4j 统一执行可见性规则 */
type DocumentAccessScope = {
  /** 管理员和审核员不受文档可见性限制 */
  unrestricted: boolean;
  userId: string;
  /** 所在团队与担任负责人的团队 ID */
  teamIds: string[];
};

/** 已发布文档同步到各索引的可见性字段 */
type DocumentVisibility = {
  isPublic: boolean;
  teamId: string | null;
  authorId: string | null;
};

export type { DocumentAccessScope, DocumentVisibility };
