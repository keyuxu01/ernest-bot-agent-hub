/**
 * Neo4j 图模型约束
 *
 * 图模型：
 *   (:KnowledgeDocument)-[:HAS_CHUNK]->(:DocumentChunk)-[:MENTIONS]->(:KnowledgeEntity)
 *   (:KnowledgeEntity)-[:RELATED_TO {relation}]->(:KnowledgeEntity)
 *
 * 唯一约束同时会建索引，让 MERGE / MATCH 按键查找而不是全标签扫描。
 * `IF NOT EXISTS` 保证每次启动可重复执行。
 */
const GRAPH_CONSTRAINT_STATEMENTS = [
  'CREATE CONSTRAINT kh_document_id IF NOT EXISTS FOR (d:KnowledgeDocument) REQUIRE d.id IS UNIQUE',
  'CREATE CONSTRAINT kh_chunk_id IF NOT EXISTS FOR (c:DocumentChunk) REQUIRE c.chunkId IS UNIQUE',
  'CREATE CONSTRAINT kh_entity_name IF NOT EXISTS FOR (e:KnowledgeEntity) REQUIRE e.name IS UNIQUE',
] as const;

export { GRAPH_CONSTRAINT_STATEMENTS };
