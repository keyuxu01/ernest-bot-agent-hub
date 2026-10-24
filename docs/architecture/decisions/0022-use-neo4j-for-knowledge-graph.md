# ADR-0022：Neo4j 承载文档知识图谱（KG 建图管线）

- 状态：Accepted
- 日期：2026-10-25
- 来源：迁入 knowledge-hub-backend 的 `bb867d5e75d1c62d0d25243dd2f636492663b0fa`。
- 相关：[ADR-0007](./0007-use-rabbitmq.md)、[ADR-0016](./0016-use-elasticsearch-for-rag-chunks.md)、
  [ADR-0017](./0017-place-qwen-embedding-in-infrastructure.md)、[ADR-0021](./0021-document-search-index.md)

## 背景与决策

产品目标包含图谱多跳检索，Neo4j 此前只在输入材料和 compose 中出现，没有 ADR 或实现。
文档发布后新增第三条独立命令：`kg.graph.exchange` / `kh.kg.graph.queue`，契约为
`@repo/contracts` 的 `RagBusinessKgBuildMessageV1`（BY_DOC_IDS / DELETE_BY_DOC_IDS，只带文档 ID）。
KG 抽取逐块调用 LLM，比 RAG / Search 慢一个量级，独立队列避免拖住另两条管线。

图模型：`(KnowledgeDocument)-[:HAS_CHUNK]->(DocumentChunk)-[:MENTIONS]->(KnowledgeEntity)`，
实体间 `(KnowledgeEntity)-[:RELATED_TO {relation}]->(KnowledgeEntity)`。块复用 RAG 的
ChunkingService，chunkId 与 ES `kh_chunk` 相同，图谱与向量结果可按块互查。
实体按 name 跨文档复用；启动时为文档 id、chunkId、实体 name 建唯一约束。

分层沿用 ADR-0017：Neo4j driver 与 Cypher 在 `src/infrastructure/neo4j`（GraphStoreService），
千问对话模型客户端在 `src/infrastructure/chat-model`；prompt、Zod 结构化输出 schema、
类型归类与截断留在 `modules/pipeline`。LLM 复用 `QWEN_LLM_API_KEY` 与 DashScope 兼容地址，
新增 `CHAT_MODEL_NAME` / `CHAT_MODEL_TIMEOUT_MS`；Neo4j 新增 `NEO4J_URI/USER/PASSWORD`，均为启动必填。

与源提交的有意差异：

- 沿用 ADR-0021 的强依赖策略，Neo4j 连不上阻断启动，不迁入「不可用就跳过写入」的分支：
  跳过会正常返回并 ack，等于把未写入当成功。
- 不迁入 BUILD_ALL：当前无生产者，全量重建属于批处理，应按后台任务规则由外部调度 publisher 投递。
- 源项目多套 API Key 回退变量与 KG_MAX_* 环境变量收敛为单一配置和常量。
- 启动时为文档 id、chunkId、实体 name 建唯一约束（源提交无）。
- 联调修复：抽取 schema 的 `relation` 改为必填，并在 relation / type 中取具体类型。
  源提交 optional 时 qwen-plus 在长片段中会省略该字段，关系语义全部退化为 RELATED_TO。

Cypher 与写入顺序（文档 → 块 → 逐实体 / 逐关系 `session.run`）、实体截断与不去重、
每对实体一条 RELATED_TO（relation 仅在创建时写入）均与源提交保持一致，便于对照后续版本。
批量写入、单块事务、按 relation 区分边等优化不在本次迁移范围。

## 边界与后果

与 RAG / Search 相同，发布和软删后并行投递，没有跨库 / MQ 事务，失败不回滚文档状态；
没有 outbox、有限重试、DLQ、补偿扫描或乱序控制，不能作为生产可靠投递保证。
建图先删后建，过程中图谱短暂缺失该文档；各语句不在同一事务，中途失败会留下部分图数据，
重新发布可恢复。同一对实体只保留首次抽到的关系语义。单块 LLM 失败只落块节点不落实体，消息仍 ack，
需重新发布才能补齐。单篇 Neo4j 写入失败被编排器记录后同样 ack，与 RAG 现状一致。
LLM 逐块串行调用，长文档耗时约为块数 × 单次耗时，会产生模型费用。
RELATED_TO 不记录来源文档，删除文档时仍被他处提及的实体之间的关系边会残留；
孤儿实体清理当前全量扫描 KnowledgeEntity，规模变大后需改为只检查本文档曾提及的实体。
本次不新增图谱查询 API、不接入检索链路，也不提供 Neo4j readiness 探针。

部署时应先更新消费者再启用新生产者；回滚需停投并排空 `kh.kg.graph.queue`。
Neo4j 中的图数据可由重新发布重建，删除整库需单独授权，不影响 PG / Mongo 原文。

## 验证

契约测试覆盖默认版本、删除类型、空 ID 列表、BUILD_ALL 与错误版本被拒；
业务测试覆盖抽取结果归类 / 截断 / 悬空关系丢弃 / relation 回退、写入顺序、单块抽取失败不阻断、
Neo4j 写入失败上抛、按 ID 删除不查库、单篇失败隔离，以及发布 / 删除各投递三条命令。
另在本地 compose（RabbitMQ / Neo4j / DashScope qwen-plus）手工联调过发布、重复发布与软删：
图谱写入、先清再建、删除后文档 / 块 / 孤儿实体 / 关系清零均符合预期。这不是自动化或生产验收。
