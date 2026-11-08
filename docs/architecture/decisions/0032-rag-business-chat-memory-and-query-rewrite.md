# ADR-0032：RagBusiness 对话记忆与检索查询改写

- 状态：Accepted
- 日期：2026-11-08
- 来源：迁入 knowledge-hub-backend 的 `15d4a2d2e5c2fdd264316883c0e868716a2f433d`（v16）。
- 相关：[ADR-0008](./0008-use-redis.md)、
  [ADR-0027](./0027-rag-business-hybrid-retrieval-and-chat.md)、
  [ADR-0029](./0029-rag-business-ai-chat-sessions.md)、
  [ADR-0030](./0030-rag-business-streaming-agent-and-web-search.md)、
  [ADR-0031](./0031-rag-business-document-visibility.md)

## 背景与决策

v15 的普通和流式问答只使用当前问题。虽然 PostgreSQL 已保存会话消息，模型不会读取历史，“那这个找谁”等追问
无法消解指代；用户偏好也不能跨会话保留。v16 引入 PostgreSQL 持久历史、Redis 工作窗口和可选 Mem0 长期记忆，
并在检索前把追问改写成独立查询。

### PostgreSQL 持久历史

`kh_ai_message` 仍是会话消息的持久事实来源。新增“最近 N 条”读取：数据库按时间和 ID 倒序取窗口，再恢复为正序。
数据库结构不变。

### Redis 短期记忆

- Key：`{CHAT_SHORT_MEMORY_KEY_PREFIX}:{userId}:{sessionId}:messages`，默认前缀 `kh:chat`。
- 默认保存最近 20 条 human/ai 原文，TTL 为 86400 秒。
- 命中直接作为模型工作历史；miss、格式异常或 Redis 故障时从 PostgreSQL 最近消息回填。
- TTL 到期只清热缓存，不删除 PostgreSQL 历史。
- 不保存检索资料、模型思考、工具结果或 Mem0 系统消息。

### 检索查询改写

有历史时，`ChatQueryRewriteService` 使用温度 0、默认 15 秒超时的结构化模型输出：

- `standalone_query`：消解“这个、那个、谁负责”等指代后的独立中文短查询；
- `need_retrieve`：寒暄、致谢或无关闲聊为 `false`，跳过知识库检索。

无历史、上下文为空、超时或模型失败时，回退原问题并继续检索。日志只记录查询长度与是否检索，不记录用户问题原文。

### Mem0 长期记忆

Mem0 Platform 为可选能力，使用 `mem0ai@3.1.8`。未配置 `MEM0_API_KEY` 时不创建客户端，长期记忆的搜索、写入和
删除全部跳过，不影响问答。

长期记忆分两层：

- user 层：跨会话保留用户身份、岗位、回答偏好和持久约束；
- session 层：只保存当前会话任务、进度、待办和临时约定，以 Mem0 `runId = sessionId` 隔离。

每轮回答后，结构化分类器判断是否写 user/session 层。送给 Mem0 抽取的内容只有用户原话；助手回答只供本地分类器
判断，不发送给 Mem0。分类提示明确禁止保存知识库制度、流程、负责人、系统名、联网结果和引用编号。
检索到的记忆以系统消息注入，但明确声明制度和流程仍以本轮知识库资料为准。

删除会话时同步删除 Redis 窗口和 Mem0 session 层记忆，保留 user 层长期偏好。

### 流式 Agent 摘要

流式 Agent 使用 LangChain `summarizationMiddleware`：消息达到 12 条时，由无思考、温度 0 的 compact model
生成中文摘要，并保留最近 6 条消息。摘要只用于当前 Agent 上下文压缩，不写入 PostgreSQL、Redis 或 Mem0。

## 安全与外部数据边界

- 启用 Mem0 后，分类器判定需要记忆的用户原话会发送到 `MEM0_HOST`（默认 Mem0 Platform）。部署前必须确认数据
  分类、用户告知和供应商合规要求；不得把知识库原文、鉴权 token 或完整助手回答发送给 Mem0。
- Mem0 user/session 查询都带当前 `userId`；session 层同时带 `runId`，避免跨用户、跨会话读取。
- Redis key 同时包含 userId 和 sessionId。会话归属仍先由 PostgreSQL 校验。
- Redis、Mem0、改写模型异常全部降级；不能阻断 PostgreSQL 会话读取和基础问答。

## 与源提交的差异

- 源提交在 `ChatLongMemoryService` 内直接构造 `MemoryClient`，并在长期记忆、改写和流式服务内分别构造
  `ChatOpenAI`。本项目按基础设施边界将 Mem0 SDK 放到 `src/infrastructure/mem0`，所有千问实例集中在
  `ChatModelService`。
- Zod schema、推断类型、提示词和纯转换函数分别放入 AI feature 的 `schemas/`、`type/`、`constants/`、
  `helpers/`，不把独立结构堆在 Service 文件中。
- 源提交日志输出改写后的查询文本；本项目只记录长度，避免日志保存用户问题。
- `mem0ai` 带来的可选 `better-sqlite3` 本地构建脚本被 workspace 供应链策略显式禁止。当前只使用云端
  `MemoryClient`，不使用 Mem0 OSS/本地 SQLite 存储。
- 源文件 `chat-memory.md` 迁入 `docs/guides/rag-chat-memory-testing.md`，并补齐其依赖的 01、02 PDF；
  v15 已迁入 03-06 PDF。

## 边界与后果

- 对话历史现在会发送给千问回答模型；检索改写只接收最近四条消息的截短文本。
- 非流式接口在“需要检索但没有命中”时仍直接返回固定提示；识别为无需检索的闲聊才进入模型回答。
- Redis 窗口写入失败不影响 PostgreSQL 消息保存。Mem0 写入异步触发且内部捕获异常。
- 一轮问答的 PostgreSQL、Redis 和 Mem0 写入不是分布式事务；PostgreSQL 是恢复依据。
- 当前 `.env.dev` 未配置 `MEM0_API_KEY`，因此本地默认只启用 PostgreSQL + Redis 短期记忆和查询改写。
- 本版本不修改数据库结构，不执行 SQL，也不重建数据卷。

## 验证

- 业务服务 lint、类型检查、单元测试、构建和 e2e 通过。
- 真实本地会话验证：首轮写入 PostgreSQL/Redis，后续追问读取 Redis；删除会话后 Redis key 和数据库消息消失。
- Redis key miss 后可从 PostgreSQL 最近消息恢复工作窗口。
- 未配置 Mem0 时普通和流式问答正常；Mem0 的真实读写需配置有效 Key 后按测试指南单独验收。
