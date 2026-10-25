# ADR-0023：文档发布审核与状态驱动的索引同步

- 状态：Accepted
- 日期：2026-10-25
- 来源：迁入 knowledge-hub-backend 的 `95917a30f695cb8df97e1f7f0060aeba033b50ab`（v6）。
- 相关：[ADR-0013](./0013-use-postgresql-and-mongodb-for-documents.md)、
  [ADR-0021](./0021-document-search-index.md)、[ADR-0022](./0022-use-neo4j-for-knowledge-graph.md)
- 部分替代：ADR-0021「通用 update 的归档或内容编辑不自动同步索引」这一限制。

## 背景与决策

此前 publish 直接写 Published 并投递 RAG / Search / KG，PATCH 可任意改 status 且不同步索引。
现在新增状态 `PendingReview = 3`，以及 PostgreSQL 表 `kh_document_review`：每次提交审核插入一行，
结案时回填结果（1 通过 / 2 驳回 / 3 撤销）。流转规则：

- Draft / Published / Archived 经 publish 或提交审核进入 PendingReview；
  通过后进入 Published 并建索引，驳回后回到 Draft。
- Published 可以归档（archive），也可以存为草稿（save-draft）。
- PATCH 只兼容 Published → Draft，其余状态变更走专用接口。

索引只在进入或离开 Published 时投递，由 `DocumentIndexSyncService` 统一处理：
进入时 index，归档 / 存草稿 / 从 Published 提审 / 删除时 unpublish。

审核开关为 `DOCUMENT_REQUIRE_APPROVAL`，默认开启（与源提交一致）。开启时：

- publish 进入待审；
- 不能直接创建为 Published；
- 已发布文档须先存草稿，才能修改标题或正文。

关闭时，publish 直接发布；已发布文档改标题或正文会重建索引。
开关只接受 true / false，拼错时阻断启动。

与源提交的有意差异：

- 开启审核时，归档文档重新上架同样走审核。源提交会走直接发布，绕过审核。
- 部分唯一索引 `uq_kh_document_review_pending` 保证同一文档最多一条待审，并发提审时由数据库拒绝；
  源提交只做「先查后插」。
- 「审核记录 + 文档状态」放在同一个 PG 事务内提交，结案使用 `review_result IS NULL` 条件更新，
  并发通过 / 驳回只有一个成功；源提交两步分开保存。
- 开启审核时，已发布文档不能直接改稿。源提交允许改，结果是 Mongo 中为新正文、索引仍为旧快照，
  直到再次审核通过。
- 删除文档时，在同一事务内撤销其待审任务（结果 3），避免已删文档的任务残留在待办中。
- 删除时无论原状态都投递清理（源提交只在 Published 时投递），以幂等方式补上此前失败的清理。
- 数据访问经 `DocumentReviewRepository`；业务错误使用稳定错误码 `{ statusCode, code, message }`。

## 边界与后果

审核接口未鉴权：审核人 ID 与姓名由请求体传入，任何调用方都能通过或驳回，提审人也未记录。
这是接入用户模块（UserPlatform）之前的已知风险，不能用于生产权限控制；接入后应改为从登录用户取身份，
并校验审核权限。

默认开启审核改变了 publish 的语义：调用方拿到的是 PendingReview，审核通过后才可检索。

索引投递仍沿用 ADR-0021 / ADR-0022 的限制：在事务提交之后发出，失败不回滚状态，
没有 outbox、DLQ 或乱序控制。同时，状态频繁切换（如通过后立即存草稿）可能让 index 与 delete 消息乱序。
免审时，已发布文档只有改标题 / 正文才重建索引，其余元数据变更仍不同步。

`kh_document_review` 只由 init 脚本创建；已有数据卷需要手工执行一次建表语句，或重建数据卷。

## 验证

单元测试覆盖：

- 状态规则：可发布 / 可提审 / 可归档 / 可存草稿的来源状态；
- 审核开关：缺省值、大小写与拼错拒绝；
- 创建：拒绝非法状态与需审时直接发布；
- 发布：两种开关、归档重新上架、待审拒绝；
- PATCH：审核中禁改正文、需审时已发布须先存草稿、免审时重建索引、非法状态变更；
- 归档 / 存草稿：清理索引；
- 删除：撤销待审并清理索引；
- 提审：来自 Published 时清索引，并发冲突时报错；
- 通过 / 驳回：结案参数、并发结案不建索引、驳回意见必填、筛选映射。

e2e 断言 `DocumentReviewEntity` 已注册。仓储事务、部分唯一索引与 HTTP 路由未在真实 PostgreSQL 上验证。
