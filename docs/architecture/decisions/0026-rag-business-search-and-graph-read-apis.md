# ADR-0026：RagBusiness 全文搜索、图谱查询接口与文档权限码

- 状态：Accepted
- 日期：2026-11-01
- 来源：迁入 knowledge-hub-backend 的 `7744dad7415a39765747aeefc5b36ccd023e933f`（v10）。
- 相关：[ADR-0021](./0021-document-search-index.md)、[ADR-0022](./0022-use-neo4j-for-knowledge-graph.md)、
  [ADR-0024](./0024-rag-business-built-in-auth-and-roles.md)、
  [ADR-0025](./0025-rag-business-permission-codes-and-teams.md)
- 部分替代：ADR-0021「INDEX 消息携带发布时快照、正文最多 1000 个码元、不新增搜索 API」；
  ADR-0022「没有图谱查询 API」；ADR-0025「文档、审核接口仍只按角色授权」。

## 背景与决策

ADR-0021 的 Search 消息带文档快照，为控制消息体积只截正文前 1000 字，1000 字之后的内容搜不到。
v10 改成与 RAG / KG 一致，消息只带文档 ID，消费者读库后写 ES；同时补上搜索与图谱的读接口，
并让文档接口按权限码授权。

- **Search 消息契约**：直接修改 `RagBusinessSearchIndexMessageV1`，INDEX 与 DELETE 都只含
  `schemaVersion / taskId / type / documentId`。删除 `RagBusinessSearchDocumentSchema`。
  队列里尚未消费的旧 INDEX 消息多带的 `document` 字段会被 Zod 忽略，仍可解析。
- **Search 写入**：`PipelineOrchestrator.handleSearchIndex(type, documentId)` 按 ID 从 PG + Mongo
  读取文档（已删除 / 不存在则记日志跳过），用 `toSearchIndexDocument` 组装后覆盖写入 `kh_document`，
  正文不截断。
- **IK 分词**：`kh_document` 的 `title / summary / content` 用 `ik_max_word` 写入、`ik_smart` 检索。
  启动时索引已存在但 `title` 不是 `ik_max_word`，则删除并重建（分词器不能原地修改），
  之后需重新发布文档才能搜到。插件由 `infra/elasticsearch/Dockerfile` 安装。
- **`POST /search`**（`search` 权限码）：`multi_match` 查 `title^3 / summary^2 / content`，
  可按 `categoryId / authorId` 过滤，分页（`pageSize` 最大 50），返回高亮片段，不回传正文。
- **`GET /graph/search|nodes|edges`**（只需登录）：关键词匹配实体 / 文档 / 块节点，列实体节点，
  列 `RELATED_TO` 边。
- **查询失败**：ES / Neo4j 查询出错只记 warn 日志并返回空结果（空分页 / `[]`），与源提交一致。
- **文档权限码**：新增 `PermissionCode` 常量，文档接口加 `@RequirePermission`：
  列表 / 详情 `document:list`，创建 / 上传 `document:create`，发布 / 归档 / 存草稿 / 提审 / 修改
  `document:edit`，删除 `document:delete`，审核工作台 `document:review`（仍要求审核员或管理员角色），
  当前待审 / 审核历史 `document:list` 或 `document:review`。管理员追加 `search`。
- **预置绑定**：普通用户增加「编辑文档」「删除文档」，审核员增加「搜索」。
- **作者与操作人**：`CreateDocumentDto` / `UploadParseDocumentDto` 去掉 `authorId / createBy`，
  `UpdateDocumentDto` 去掉 `updateBy`。`authorId / createBy / updateBy` 一律取登录用户；
  发布、归档、存草稿、删除、提审都写 `updateBy`。请求体再传这些字段返回 400。
- **LLM 超时**：`.env.example` 的 `CHAT_MODEL_TIMEOUT_MS` 由 60000 改为 120000
  （源提交的 `KG_LLM_TIMEOUT_MS`）。

与源提交的差异（项目约定）：

- 图谱查询放在 `src/infrastructure/neo4j/GraphStoreService`，搜索沿用
  `src/infrastructure/elasticsearch/SearchIndexService`；接口放在 `src/modules/search` 与
  `src/modules/graph`。源提交把它们放在 pipeline 的 `GraphBuildService` / `SearchIndexService`。
- ES / Neo4j 仍是启动强依赖：没有迁入源提交「客户端为空就跳过」的分支；写入失败照旧向上抛，
  由 MQ 边界 nack。只有查询按源提交返回空结果。
- 建 `kh_document` 时保留对 `resource_already_exists_exception` 的忽略（多实例同时启动）。
- `PermissionCode` 放在 `src/modules/user/constants/permission.constants.ts`。

## 边界与后果

- 自动删除重建 `kh_document` 在生产启动时同样会执行：第一次部署本版本时，旧索引会被删掉，
  已发布文档需重新发布才能被搜到（RAG 与图谱不受影响）。之后索引已是 IK，不会再触发。
- 消费者在消费时读库：消息与 ES 中的内容是消费时刻的最新内容，不再是发布时快照。
  文档已被删除或已不是 active 时直接跳过。
- 查询失败返回空结果，调用方无法区分「没有命中」和「ES / Neo4j 出错」，只能看服务日志。
- `/search` 只按权限码校验，不按文档是否公开、作者或团队过滤；`kh_document` 里只有已发布文档。
- 图谱接口只要求登录：任何登录用户都能读到全部实体、关系和块正文片段。
  `/graph/search` 是全节点 `CONTAINS` 扫描，没有索引，数据量大时会慢。
- 新增的三条预置角色权限只由 init 脚本写入；已有数据卷需手动执行对应 `INSERT`，或重建数据卷。
- 沿用 ADR-0021 的投递限制：没有 outbox、重试、DLQ。

## 验证

- 契约：INDEX / DELETE 只含 ID、旧消息的 `document` 被丢弃、非法版本 / 类型 / 缺 ID 被拒。
- 单测：Search 消息只投 ID；消费时读取 Mongo 全文（不截断）、文档不存在跳过、DELETE 按 ID 删除；
  IK 索引保留、非 IK 索引删除重建；搜索的字段权重、过滤、分页上限、高亮映射，ES 出错返回空分页；
  作者 / 创建人 / 更新人取登录用户。
- e2e（真实 PostgreSQL / MongoDB，ES / Neo4j mock）：请求体带 `authorId` 返回 400；
  `/search` 未登录 401、缺关键词 400；去掉 `ROLE_USER` 后创建文档 403、审核员仍可搜索；
  `/graph/*` 未登录 401、缺关键词 400。
- 本地真实链路（ES + IK、Neo4j、RabbitMQ、Qwen）：发布一篇 1534 字的文档，
  `POST /search` 能命中第 1000 字之后的「发票原件」并返回高亮；ES 中正文长度 1534；
  `/graph/nodes|edges|search` 返回 LLM 抽取出的实体、关系与块节点。
