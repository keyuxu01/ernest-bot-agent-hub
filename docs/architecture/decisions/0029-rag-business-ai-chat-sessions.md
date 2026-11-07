# ADR-0029：RagBusiness AI 对话会话持久化

- 状态：Accepted
- 日期：2026-11-07
- 来源：迁入 knowledge-hub-backend 的 `3bbd6c249ebac11fae8626afeb9f01c539c6359b`（v13）。
- 相关：[ADR-0013](./0013-use-postgresql-and-mongodb-for-documents.md)、
  [ADR-0024](./0024-rag-business-built-in-auth-and-roles.md)、
  [ADR-0027](./0027-rag-business-hybrid-retrieval-and-chat.md)

## 背景与决策

现有 `POST /ai/chat` 每次独立返回回答和引用，服务端不保存用户会话，前端无法恢复历史问答或管理会话。
v13 在 RagBusiness 内增加用户私有的 AI 会话与消息持久化。

- **持久化模型**：PostgreSQL `kh_ai_session` 保存用户 ID、标题与时间；`kh_ai_message` 保存
  user / assistant 消息、正文和助手引用的 sources JSON。删除会话时级联删除消息。
- **会话接口**：新增 `GET/POST /ai/sessions`、`GET /ai/sessions/:id/messages`、
  `PATCH/DELETE /ai/sessions/:id`，全部要求登录和 `search` 权限。
- **所有权**：查询、重命名、删除和追加消息都同时按 `id + user_id` 查找；不存在或属于其他用户时
  统一返回 404，避免泄露会话是否存在。
- **问答写入**：`POST /ai/chat` 接受可选 `sessionId`。未传时以首问生成标题并新建会话；
  无检索结果的固定回答也保存；空问题不保存；LLM 调用失败不保存本轮。响应新增 `sessionId`。
- **标题**：显式新建的空标题使用“新对话”；默认标题第一次追加问答时改为首问摘要，压缩空白并截取
  前 30 字，超长时追加省略号。数据库标题上限为 80 字。
- **分层**：Controller 只适配当前用户和 DTO，`ChatSessionService` 编排所有权与会话规则，
  `ChatSessionRepository` 独占 TypeORM 数据访问。

与源提交的差异（项目约定）：

- 源提交在 Service 中直接注入 `EntityManager`；本项目按 Repository 约束下沉到
  `src/modules/ai/repository/ChatSessionRepository`，方法行为和返回结构不变。
- 实体、独立类型、纯标题函数分别放入 feature 的 `entities/`、`type/`、`helpers/`。
- PostgreSQL 时间列使用项目统一的 `TIMESTAMPTZ`，而不是源提交的无时区 `TIMESTAMP`。
- TypeORM 通过 `AiModule` 的 `forFeature` 配合根连接 `autoLoadEntities` 注册实体，不在根 AppModule
  手工列举业务实体。

## 边界与后果

- 会话只保存单轮问答历史；生成下一轮回答时仍只使用当前问题检索，不把历史消息发送给 LLM。
- `sources` 是回答生成时的引用快照，后续文档更新不会回写历史消息。
- 与源实现一致，一轮问答的会话更新时间和两条消息未包在同一个数据库事务中；进程在写入中途退出时
  可能留下已更新时间但缺消息的会话。事务化作为后续可靠性改进单独处理。
- `kh_ai_session.user_id` 与源实现一致不设数据库外键，用户删除策略仍由应用层决定。
- 本次沿用仓库现有初始化脚本机制，同时可把新增的幂等 SQL 直接执行到当前本地数据库，无需删除数据卷。
  是否引入正式增量 migration 机制另行决策。

## 验证

- 业务服务 lint、类型检查、单元测试、构建与 e2e 测试通过。
- 当前本地 PostgreSQL 已幂等创建 `kh_ai_session`、`kh_ai_message` 和对应索引。
- `POST /ai/chat` 兼容未指定会话的调用，并返回创建后的 `sessionId`。
