# ADR-0031：RagBusiness 文档可见性跨存储一致执行

- 状态：Accepted
- 日期：2026-11-08
- 来源：迁入 knowledge-hub-backend 的 `a0688dbeeaaa68851bae48f37f3447286629dc14`（v15）。
- 相关：[ADR-0021](./0021-document-search-index.md)、
  [ADR-0022](./0022-use-neo4j-for-knowledge-graph.md)、
  [ADR-0024](./0024-rag-business-built-in-auth-and-roles.md)、
  [ADR-0025](./0025-rag-business-permission-codes-and-teams.md)、
  [ADR-0026](./0026-rag-business-search-and-graph-read-apis.md)、
  [ADR-0027](./0027-rag-business-hybrid-retrieval-and-chat.md)
- 部分替代：ADR-0024、ADR-0026 和 ADR-0027 中“没有文档所有权/可见性过滤”的限制。

## 背景与决策

此前 `document:list` 和 `search` 只决定用户能否调用接口。任何拥有权限码的用户都能读取全部文档元数据、
全文搜索结果、RAG 块和图谱数据，也能修改其他作者的文档。v15 增加统一文档可见范围，并在 PostgreSQL、
Elasticsearch 和 Neo4j 查询阶段执行，不能先召回再在应用层丢弃。

### 可见范围

普通用户可读以下并集：

1. 自己创作的文档，不限制状态；
2. 已发布且 `isPublic = true` 的文档；
3. 已发布、非公开且 `teamId` 属于本人团队的文档。

`ROLE_ADMIN` 和 `ROLE_REVIEWER` 读取不受限制。写操作更严格：只有 `ROLE_ADMIN` 或文档作者可以更新、
发布、归档、存草稿、删除或提交审核；审核员身份本身不允许修改他人文档。审核通过/驳回仍按既有审核角色执行。

### 用户与团队范围

- `AuthUser` 增加 `teamIds`。JWT 每次验证后重读用户、角色、权限以及团队，因此成员变更在下次请求立即生效。
- 团队范围是 `kh_team_member` 成员身份与 `kh_team.leader_id` 负责人身份的并集，并过滤软删团队。
- 新增 `GET /teams/mine`，由独立静态路由 Controller 注册，登录用户可读取自己作为成员或负责人的团队；
  其余团队管理接口仍要求管理员和 `system:team` 权限。

### 各存储执行方式

- **PostgreSQL 列表**：`DocumentRepository` 在原筛选前增加作者、Published、公开和团队条件。
- **详情与写操作**：`DocumentService` 加载文档后执行读取或写入判定；不可读/不可写返回 403。
- **全文搜索 `kh_document`**：相关性查询放 `must`，可见性放 `filter`，不影响得分。索引增加 `teamId` 和
  `isPublic` mapping，结果回传这两个字段。
- **RAG `kh_chunk`**：BM25 和 kNN 两路都在召回阶段加同一可见性 filter，避免不可见块占据 top-K。
  chunk 增加 `is_public`；已有 `author_id`、`team_id` 继续使用。
- **Neo4j**：`KnowledgeDocument` 增加 `teamId`、`isPublic`。文档、块、实体、关系和 overview 统计都必须
  能追溯到当前用户可见的文档。
- **AI 问答**：普通、流式和纯 RAG 搜索都把当前 `AuthUser` 传入混合检索。没有用户上下文的内部调用只允许
  检索公开文档。

### 可见性变更同步

已发布文档只修改 `isPublic` 或 `teamId` 时，不重算 embedding，也不重新抽取实体：

- `kh_document` 更新一条文档的可见性字段；
- `kh_chunk` 按 `document_id` 用 update-by-query 更新全部块；
- Neo4j 只更新 `KnowledgeDocument` 属性。

三处更新并行执行。基础设施更新失败只记 warn，不回滚 PostgreSQL 文档保存，与现有“索引失败不回滚业务事实”
边界一致。

## 与源提交的差异

- 源提交把访问类型、ES filter、Cypher helper 和文档规则放在一个 `document-access.ts`。本项目按依赖方向拆分：
  跨模块范围类型位于 `src/common/type`，业务判定位于 Document helper，ES/Cypher 生成器分别位于对应基础设施。
- 源提交让 `DocumentService` 依赖 `PipelineOrchestrator`，形成 Document/Pipeline 模块反向依赖。本项目把即时
  可见性同步放入既有 `DocumentIndexSyncService`，由 DocumentModule 直接依赖 Elasticsearch/Neo4j 基础设施。
- 源提交在 `RolesGuard` 中增加 `@Public()` 判断；本项目不修改该守卫。团队树本来就不公开，并且已明确要求
  守卫保持现状。`/teams/mine` 只依赖全局 JWT，管理接口逐个保留 `@Roles(ROLE_ADMIN)`。
- 数据库访问继续经 Repository，不把源提交的 EntityManager/TypeORM Repository 直接注入业务 Service。
- v15 附带的四个 PDF 测试资料按原始字节迁入仓库 `test-files/`，SHA-256 与源文件一致。

## 迁移与后果

- 本版本不修改 PostgreSQL 或 MongoDB schema，不执行 SQL，也不重建数据卷。
- Elasticsearch 会在启动时幂等补充新 mapping。已有 `kh_chunk` 没有 `is_public` 值，已有图谱文档也可能没有
  `teamId/isPublic`，因此现有已发布文档需要重新发布/重建索引后，普通用户才能得到完整且正确的可见结果。
  管理员和审核员读取不受这些缺失字段影响。
- 团队被禁用但未软删时仍计入用户范围，与源提交一致；软删团队不计入。
- `search`、`document:list` 等权限码仍是接口能力门槛，文档可见性是在能力门槛后的第二层数据过滤。
- 图谱实体可被多个文档共享。普通用户只有在实体至少被一篇可见文档提及时才能看到该实体；关系两端都必须满足。

## 验证

- 业务服务 lint、类型检查、单元测试、构建和 e2e 通过。
- 验证普通用户、团队成员、作者、审核员和管理员在列表、详情、全文搜索、RAG、普通/流式问答及图谱中的范围。
- 验证已发布文档修改公开/团队后，三套索引即时更新可见性字段。
- 四个 PDF 与源提交文件的 SHA-256 一致。
