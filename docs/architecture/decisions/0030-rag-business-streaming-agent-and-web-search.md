# ADR-0030：RagBusiness 流式 Agent 问答与按需联网搜索

- 状态：Accepted
- 日期：2026-11-08
- 来源：迁入 knowledge-hub-backend 的 `fd9629174d7271051cdb278539797b2421d604f5`（v14）。
- 相关：[ADR-0017](./0017-place-qwen-embedding-in-infrastructure.md)、
  [ADR-0027](./0027-rag-business-hybrid-retrieval-and-chat.md)、
  [ADR-0029](./0029-rag-business-ai-chat-sessions.md)

## 背景与决策

现有 `POST /ai/chat` 等待检索和模型完整回答后一次性返回，不能逐段展示状态、资料、模型思考、
工具调用和回答。知识库没有资料时也不能查询最新公开信息。v14 增加与 AI SDK `useChat` 兼容的
流式 Agent 接口，并允许模型按需调用博查 Web Search。

- **流式接口**：新增 `POST /ai/chat/stream`，要求登录和 `search` 权限。请求接收 AI SDK UI messages、
  可选 `sessionId` 和 `topK`，通过 `createUIMessageStream` 输出 UI Message Stream。
- **事件**：流中包括 session、检索状态、检索结果、sources、source-document、模型文本、思考内容和
  web_search 工具事件。百炼兼容接口的 `reasoning_content` 映射为 `@ai-sdk/langchain` 识别的
  `reasoning.summary`。
- **Agent**：使用 LangChain `createAgent` 和 `modelCallLimitMiddleware`，单次请求最多调用模型 4 次，
  防止搜索工具循环。系统提示要求优先使用知识库，仅在资料不足、需要时效性或外部公开信息时联网。
- **模型**：`ChatModelService` 集中构造流式千问客户端，并固定开启模型思考；
  `QWEN_LLM_API_KEY` 继续是启动必填项。
- **联网搜索**：博查客户端位于 `src/infrastructure/web-search`。`BOCHA_API_KEY` 可选；未配置时工具返回
  明确错误而不阻断启动。响应通过 Zod 在第三方边界校验，日志不记录查询正文或 API Key。
- **会话持久化**：流开始时创建或触碰本人会话标题；流完成后从最终文本提取 `[n]`，只保存实际引用的
  知识库 sources。流式落库失败只记 warn，不改写已经发送给客户端的响应。
- **检索过滤**：新增 `RAG_MIN_SCORE`，默认 `0.4`。Rerank 对全部融合候选评分后先过滤低分结果，再取
  `topK`；设为 `0` 时不过滤。Rerank 调用失败降级为 RRF 时不应用该阈值。
- **Rerank 兼容**：同时接受标准 `output.results` 和部分兼容部署返回的顶层 `results`。

依赖锁定为源提交使用的版本：`@ai-sdk/langchain@3.0.93`、`ai@7.0.93`、`langchain@1.5.10`。
源锁文件把 LangGraph 传递依赖固定在与当前 `@langchain/core` 1.2.x 兼容的版本，因此 workspace override
固定 `@langchain/langgraph@1.4.14`、`@langchain/langgraph-checkpoint@1.1.5` 和
`@langchain/langgraph-sdk@1.10.2`，避免安装时漂移到要求 core 1.3.x 的版本。

与源提交的差异（项目约定）：

- 源提交在 `AiStreamService` 内直接构造 `ChatOpenAI`；本项目沿用基础设施边界，由
  `ChatModelService.streamAnswerModel` 提供配置好的千问客户端。
- 源提交把 Web Search 客户端放在 AI feature；本项目把第三方客户端、Zod 响应 schema 和类型放在
  `src/infrastructure/web-search`，AI feature 只负责 Agent 编排。
- 流式 helper、常量和独立类型分别放在 feature 的 `helpers/`、`constants/`、`type/`，并复用既有
  RAG context/source 转换，不在 Service 内复制算法。
- 源提交增加 `LLM_ENABLE_THINKING` 开关；本项目按既有约定不为已启用能力增加运行期开关，
  流式模型固定传 `enable_thinking: true`。
- 本项目已有必填千问 Key 和启动强依赖，因此不保留“模型 Key 缺失时 Agent 不创建”的运行期分支。

## 安全与数据边界

- 只有 Agent 实际调用 `web_search` 时，搜索关键词才发送到 `https://api.bochaai.com/v1/web-search`；
  知识库原文、用户身份、会话 ID 和鉴权 token 不发送给博查。
- 搜索结果属于不可信外部内容，只作为模型工具结果；服务不执行网页代码，也不自动抓取结果 URL。
- `BOCHA_API_KEY` 只从环境变量读取并放入 Authorization header，不写入日志、数据库或流式事件。
- 流式 endpoint 使用 Nest 全局 JWT 和权限守卫；会话所有权继续由 `ChatSessionService` 校验。

## 边界与后果

- 流式请求只读取最后一条 user 文本；历史 UI messages 不发送给模型。与非流式接口一样，当前仍不是
  多轮上下文对话。
- 检索异常会降级为无知识库资料的 Agent 回答，Agent 可选择联网；模型或流适配异常由 UI Message
  Stream 的 error 事件表示。
- 客户端断开后的模型取消与落库语义仍沿用 AI SDK 默认行为，本版本没有新增显式 AbortSignal 编排。
- `RAG_MIN_SCORE=0.4` 会让低相关查询返回空知识库资料，可能比 v13 更频繁触发联网工具。
- 本版本不修改数据库结构，无需重建数据卷，也无需执行增量 SQL。

## 验证

- 业务服务 lint、类型检查、单元测试、构建和 e2e 通过。
- 本地运行时验证 JWT 权限、UI Message Stream content type、session/data/source/text/finish 事件和问答落库。
- 未配置 `BOCHA_API_KEY` 时，web_search 返回空 items 和明确 error。
