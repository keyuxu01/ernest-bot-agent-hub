# Assistant Runtime + 本地控制台——Node 批准目标能力方案（草案）

> 日期：2026-10-05
> 状态：accepted design input / 已由 ADR-0018～0020 固化长期边界 / OpenSpec Apply 尚未开始
> 产品语义：**助手（Assistant）**，与 `RagBusiness` 并行，不并入 RAG 问答线
> 目标：**在 Node 技术栈中实现经确认的目标能力，不复制 Kodex 的 Kotlin、存储格式或 Codex 专属协议。固定 baseline 中已接线的 Suggested Sessions 经用户批准排除，因此不宣称精确 Kodex parity。**

## 0. 目标

| 档位          | 含义                                                          | 决策                           |
| ------------- | ------------------------------------------------------------- | ------------------------------ |
| 能力          | 实现经逐项确认的 Node 目标；记录与 Kodex baseline 的差异      | **做这个**                     |
| 实现          | Node 改写：Deep Agents（LangGraph 引擎）+ Redis/PG/Mem0 + MCP | **用这个换掉手搓**             |
| Codex 协议    | 打 chatgpt.com/codex Responses、远程 compact v2               | **不做**（能力用别的实现补）   |
| 六时间线 JSON | 自研 `{timeline}/{n}.json`                                    | **不做**（能力用 Redis/PG 补） |

没有 P0 / P1 / P2 产品档位。不交付「只有 ping 的脚手架」当成一版产品。工程上可以按依赖顺序施工，但验收以能力对齐为准，不把 compact / fork / HITL / 控制台当成以后再说。

目标范围先固定一个 Kodex commit，并把能力分成三类：当前产品已接线能力原则上对齐；代码存在但未接线的能力单独决定；明确批准的 Suggested Sessions 排除作为功能差异永久披露；Mem0 和真正的 Deep Agents subagent 等增强不能冒充被排除或遗漏的 baseline 能力。框架名称不是验收证据，Session、Run、事件、权限、幂等、恢复和客户端协议仍由本产品定义。

与现有 `agentic-rag-*` **并行**。远程业务 Tool 复用 `mcp-app-collections`（`@rekog/mcp-nest` v2）；本机编码 Tool 通过专用本机工具桥执行。

### 0.1 完整功能索引

下列 ID 是方案、OpenSpec、代码、测试和最终验收共用的稳定编号。后续可以补充子项，不能在未迁移引用时重排或复用编号。

| ID      | 功能点                   | 完整实现含义                                                                 |
| ------- | ------------------------ | ---------------------------------------------------------------------------- |
| CAP-001 | 身份准入                 | Google OAuth + PKCE、助手白名单、短寿命票据、停用/撤销语义                   |
| CAP-002 | 资源所有权               | Session、Run、Artifact、MCP、凭据、Mem0、CLI/workspace 全链路 owner 校验     |
| CAP-003 | Session 生命周期         | 目录、创建、打开、重命名、自动标题、归档、删除和运行标记                     |
| CAP-004 | Run / Turn 状态机        | 后端任务所有权、状态迁移、单 active Run、明确终态                            |
| CAP-005 | 耐久事件历史             | message/reasoning/tool/plan/compact/interrupt 的有序 PG 事件和分页投影       |
| CAP-006 | 流式与重连               | typed SSE、cursor、补流、去重、缺口检测、heartbeat、慢消费者处理             |
| CAP-007 | Continue / Retry         | 正常 continuation、provider retry、工具失败和永久失败分离                    |
| CAP-008 | 回合中 steer             | active Run 的 durable 输入队列和安全消费边界                                 |
| CAP-009 | Stop / Cancel            | 显式停止 Run、MCP、本机工具和进程树；订阅断开不等于停止                      |
| CAP-010 | Model Catalog            | 用户自有连接、自由模型名、reasoning/service tier、能力与 usage 显式降级      |
| CAP-011 | 远程 MCP                 | 仅公共 HTTPS：配置、OAuth、刷新、目录版本、SSRF 防护和结构化结果             |
| CAP-012 | Local Tool Gateway       | 准确 CLI/设备/workspace 绑定、请求投递、结果回传、断线与接管                 |
| CAP-013 | 长进程终端               | `exec_command`、`write_stdin`、输出分块、backpressure、最终输出和进程树终止  |
| CAP-014 | 编码工具套件             | patch、文件/图片查看、web、image generation、plan、context budget 等等价能力 |
| CAP-015 | HITL                     | `request_user_input`、审批、拒绝、跨重启恢复和重复回答幂等                   |
| CAP-016 | Subagent                 | Deep Agents 子任务、隔离上下文、权限/预算继承、work tree；标记为 Node 增强   |
| CAP-017 | Pending / 崩溃恢复       | durable checkpoint、pending tool/interrupt 恢复和副作用去重                  |
| CAP-018 | Context compact          | 自动/强制压缩、状态、失败、token 重置、保留原始历史与 fork                   |
| CAP-019 | Fork / Revert            | 精确事件点独立复制、回退、回退并编辑，以及源/目标删除隔离                    |
| CAP-020 | Settings CAS             | Session/model/runtime 设置的版本化原子更新和冲突反馈                         |
| CAP-021 | AGENTS / Skills          | 本机层级解析、显式 skill、snapshot、hash、恢复/fork 和 prompt 安全           |
| CAP-022 | PG + Redis 分层          | PG durable SoR；Redis 窗口/摘要热副本、lease、fencing、限流和 fan-out        |
| CAP-023 | Mem0 长期记忆            | 仅过滤后的长期事实：scope、来源、去重、纠错、删除、禁存内容与失败补偿        |
| CAP-024 | Hook                     | baseline 核验后定义事件、顺序、输入输出、超时、失败和取消语义                |
| CAP-025 | Artifact / Image         | artifact owner、MIME、存储、传输、图片输入/查看/生成与删除                   |
| CAP-026 | Ink Session / History UI | Session tree、大历史分页、流式合并、工具/HITL/subagent 状态和 context menu   |
| CAP-027 | Ink 操作 UI              | composer、steer、stop、settings、path picker、patch、terminal、键鼠焦点      |
| CAP-028 | Usage                    | provider usage 归一化、token/费用/限额展示和不可用状态                       |
| CAP-029 | Observability / Audit    | trace、结构化日志、指标、事件审计、敏感信息脱敏和诊断关联                    |
| CAP-030 | 多实例正确性             | lease、fencing、幂等、outbox、未知结果和跨 replica 恢复                      |
| CAP-031 | 删除与隐私               | secret 加密、数据保留、Session/Artifact/Mem0 删除和部分失败报告              |
| CAP-032 | 交付与验收               | OpenSpec、ADR、migration、故障注入、E2E、CLI 运行验收和发布证据              |

每个功能点只有在 companion capability ledger 中达到 `Verified` 才算交付；“代码存在”“编译通过”或“框架声称支持”都不能替代功能验收。

---

## 1. 两个网络服务 + 一个本地 CLI

| App        | 路径                                   | 端口   | 职责                                                                                    |
| ---------- | -------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| 用户平台   | `apps/user-platform-service`（方案名） | 待定   | Google OAuth、助手 User 白名单、签发和撤销访问票据；不做 RAG RBAC。契约 `UserPlatform*` |
| 助手运行时 | `apps/assistant-runtime-service`       | `9030` | Nest：编排、耐久 Run、SSE、模型、MCP、工具调度、记忆编排；**只验票，不做登录**          |
| 本地控制台 | `apps/assistant-cli`                   | —      | Ink TUI、loopback 登录、本机工作区、本机工具执行、HITL；不直连模型、PG 或 Redis         |

```text
assistant-cli ──Google OAuth──► user-platform-service
       │ 拿到票
       └──HTTP/SSE + Bearer──► assistant-runtime-service
                                  ├ 验 UserPlatform 票 / 白名单
                                  ├ Postgres（事件 / Run / checkpoint 真源）
                                  ├ Redis（热工作集 / 协调）
                                  ├ Mem0（抽取的长期记忆）
                                  ├ 多模型（LangChain chat model）
                                  └ MCP ──► mcp-app-collections :9021
       ▲
       └──本机 Tool request/result──Runtime 持久化调度，CLI 在授权工作区执行
```

这不是 Kodex。Kodex 是本机单进程，凭据在 `~/.codex`。我们的 runtime 是**网络服务**（工具能 exec / patch），未鉴权等于对公网开了个编码代理。认证只解决“谁能进入”，本机工具桥还必须解决“哪台设备、哪个工作区、允许执行什么”。禁止裸 `:9030`。

前缀：`AssistantRuntime`（runtime + CLI）、`UserPlatform`（登录 / 白名单）。不是 `AssistantBusiness`，也不是裸 `Business`。

### 技术清单

| 层               | 用什么                                                        | 不用什么                               |
| ---------------- | ------------------------------------------------------------- | -------------------------------------- |
| 语言 / 仓        | TypeScript、现有 pnpm/Turborepo/Nest                          | 再开 Kodex 式 KMP                      |
| Agent 循环       | Deep Agents                                                   | 自研装饰器 runtime、裸 `createAgent`   |
| 编排引擎         | LangGraph.js（Deep Agents 底下）                              | 业务里手铺一张大 graph                 |
| 模型             | LangChain chat model（OpenAI-compatible）                     | Codex Responses；主循环再套一套 AI SDK |
| 传输 CLI↔runtime | HTTP + **SSE**                                                | 本机六时间线文件、kRPC                 |
| 控制台           | Ink                                                           | Mosaic、readline stub                  |
| 耐久真源         | Postgres（会话、事件、Run、Tool、Interrupt、checkpoint）      | `~/.kodex` JSON；Redis 当唯一真源      |
| 热状态           | Redis（窗口、摘要热副本、lease、限流、SSE fan-out）           | 不可重建的唯一业务事实                 |
| 长期记忆         | Mem0 user + session/run scopes                                | 聊天记录或执行 checkpoint              |
| 远程工具         | `mcp-app-collections` + `@rekog/mcp-nest` v2                  | runtime 内第二套远程业务 tool 框架     |
| 本机工具         | Runtime Local Tool Gateway + CLI 原生 executor                 | MCP 化本机工具；Runtime 直接访问工作区 |
| 契约             | `@repo/contracts` 前缀 `AssistantRuntime*`                    | 无前缀 / 裸 `Business`                 |
| 鉴权             | Google OAuth + 助手专用 User 表（`UserPlatform`，未命中 401） | 裸 `:9030`；和 RAG RBAC User 共表      |

### SSE 和 AI SDK

SSE 是 **传输**。Ink CLI 用 `fetch` 读 runtime 的 SSE，不需要网页，也不依赖 AI SDK。Kodex 用进程内 Flow；我们用 SSE 做同样的流式通道。

Vercel AI SDK **可以**在服务端产出 SSE（`toUIMessageStreamResponse` 等），将来 Web 也能 `useChat`。但现在宿主是 CLI：

- **能用 SSE**：必须用。CLI 和以后 Web 都吃同一条流。
- **不能**把 AI SDK 当 Agent 主循环：主循环是 Deep Agents。再 `streamText()` 会两套工具循环、两套中断。
- **不能**在 Ink 里当网页那样用 `@ai-sdk/react` 的 `useChat` 当产品 UI。
- AI SDK 只留给：Nest 辅助请求（自动标题）；若要和未来 Web 共用流格式，可以把 LangGraph 事件 **适配成** AI SDK UI Message Stream 再经 SSE 发出。那是线协议，不是第二套 runtime。

---

## 2. 用什么换掉 Kodex 的手搓，以及补齐什么能力空缺

| Kodex 当前实现 / 能力空缺   | 问题                                         | 我们的替代                                                     | 对齐或新增的能力                                 |
| --------------------------- | -------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| 六时间线 JSON               | 自研事件日志，难复用、难运维                 | Postgres 耐久事件/执行模型 + Redis 热投影                      | 历史、压缩点、pending tool、fork、时间/token     |
| 缺少跨 Session 长期记忆层   | 历史记录和摘要不能代替用户事实、偏好及其纠错 | **Mem0** user + session/run scope；Postgres 记录来源与补偿状态 | 跨会话召回、来源追踪、纠错、删除、写入失败补偿   |
| AgentState + 装饰器 runtime | 为 Codex Responses 定制的状态机              | **Deep Agents**（底下是 LangGraph）                            | resume、工具循环、steer、compact、HITL、subagent |
| 只打 Codex Responses        | 绑死一家协议                                 | LangChain chat model / OpenAI-compatible                       | 流式、多厂商、Continue / Retry                   |
| 本机文件 `~/.kodex`         | 无多实例、无真源                             | Postgres 真源；Redis 短期                                      | 会话目录、归档、设置 CAS                         |
| 进程内 kRPC 前后端          | 为未来 Desktop 预埋，一期仍单进程            | HTTP/SSE + 契约（`AssistantRuntime*`）                         | 控制台与 runtime 隔离，前端不摸存储              |
| Mosaic TUI                  | Kotlin/Compose 终端，和我们栈无关            | **Ink** CLI（React 终端，对齐其界面能力）                      | 会话树、历史流、设置、路径、补丁渲染             |
| 自研远程 tool 框架          | 与 MCP 并行两套                              | 远程业务工具走 `mcp-app-collections`；本机工具走 Host Gateway  | 工具循环、动态工具、OAuth、刷新、本地工作区      |

**不选**只表示不抄实现，不表示不做能力。

Mem0 是 Node 方案新增的长期记忆能力，不替代六时间线、LangGraph checkpoint 或产品历史：Postgres 仍是会话、执行和来源记录的耐久真源，Redis 仍只承载可重建的短期工作集，Mem0 专门管理从交互中提取并可纠错、可删除的用户与 Session 事实。

一期只接入 **Mem0 Platform 托管服务**，通过 Runtime 内部端口隔离厂商 SDK。Mem0 OSS 源码仓库不并入本 monorepo、不作为 Git submodule，也不在一期部署独立 Mem0 Server；仓库只保存 Platform adapter、配置契约、补偿账本和测试替身。自部署等数据量、合规或成本确实需要时再建立独立 OpenSpec change，复用同一端口迁移，不扩大本期实现与运维面。

### Harness 选型（建议锁定）

Deep Agents 和 LangGraph **不是二选一**。Deep Agents 是 harness（规划、subagent、上下文管理、`interruptOn` HITL），LangGraph 是它底下的 durable runtime（checkpointer、中断、流式）。

| 选                                            | 原因                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| **Deep Agents 作 Agent 循环**                 | 对齐 tool / compact / HITL，并提供真正的 child Run SubAgent，不必再手搓装饰器栈 |
| **LangGraph 作引擎，不直接铺业务图**          | 要自定义确定性步骤时再下沉到 graph / middleware                                   |
| **不要**再自研 Kodex 式 `ResumableAgentLayer` | 那正是要换掉的手搓                                                                |
| **不要**只用 `createAgent` 裸循环             | 缺 compact / subagent / 生产级 interrupt                                          |

Checkpointer：HITL、pending tool 和崩溃续跑要求执行现场耐久，因此 **Postgres 是 LangGraph durable checkpoint 真源**；Redis 只缓存热 checkpoint、窗口和运行租约。Checkpoint blob 不是产品历史真源，结构化 Session/Event/Tool/Interrupt 才是；两者必须定义同一提交边界或恢复协议。

模型主路径跟 harness 走 **LangChain chat model**（OpenAI-compatible，多厂商）。不要 Deep Agents 一套循环、AI SDK 再套一套。AI SDK 只留给 Nest 辅助请求（自动标题等）和将来 Web，不是 Agent 主循环。

### 控制台选型（建议锁定）

| 选                                   | 原因                                                  |
| ------------------------------------ | ----------------------------------------------------- |
| **Ink**                              | Node 里唯一能对齐 Mosaic 交互密度的栈；团队已有 React |
| **不要** readline / 纯 HTTP ping CLI | 对齐不了会话树、历史流、设置、路径、patch             |
| **不要**抄 Mosaic / Compose          | 和仓库栈无关                                          |

CLI 只做宿主：渲染、HITL 回答、打开 Google 登录。业务仍走 runtime HTTP/SSE。

### 鉴权（建议锁定）

`UserPlatform` **只做薄鉴权**，不是账号中台，也不是 RAG 的权限系统：

1. Google OAuth（身份）
2. 查 **助手专用 User 表**
3. 命中 → 签发访问票据；未命中 / 停用 → **401**

不做角色、组织、菜单、数据权限。RAG 以后自己设计复杂 RBAC User，和这张表分开。

Kodex 是本机文件 token。我们 runtime 在网上且能跑危险工具，所以必须先过这层，再谈厂商模型 key。

| 步          | 谁做                      | 规则                                                                 |
| ----------- | ------------------------- | -------------------------------------------------------------------- |
| 1. 身份     | Google OAuth              | 授权码 + PKCE。只证明 Google 账号                                    |
| 2. 准入     | 查助手 User 表            | email / `sub` 对上且允许使用助手。对不上 = 401。OAuth 成功不等于能进 |
| 3. 票       | `UserPlatform`            | 短寿命 access。契约 `UserPlatform*`                                  |
| 4. 使用     | `AssistantRuntime` 只验票 | HTTP/SSE 带 Bearer；无效 → 401。不跑 Google 回调、不改 User 表       |
| 5. 厂商 key | runtime / 用户配置        | 和「谁能用助手」分开                                                 |

#### 助手 User 表（与 RAG 隔离）

单独一张（或单独 schema），在方案和表注释里标明 **助手 Agent 白名单**，例如 `assistant_user` / `UserPlatformAssistantUser`。

| 有                                               | 没有                               |
| ------------------------------------------------ | ---------------------------------- |
| 稳定 id、Google `sub`、email、是否启用、何时拉黑 | 角色、部门、RAG 空间权限、文档 ACL |

- **禁止**和未来 `RagBusiness` User 共用一张表、共用一套 RBAC。
- RAG User 以后自己设计，放开做复杂权限；助手这边保持「在名单里就能用 / 不在就是 401」。
- 新同事：先写入助手表。移出或停用后立即阻止新签发和 refresh；已签发的五分钟 access token 以及既有 stream 最迟在 token 到期时失效。一期不增加 deny list、撤销总线或逐请求 introspection。

CLI：本机 loopback 收 Google 回调，换成 UserPlatform 票，不把 Google refresh 散落到助手服务。

### 工具落点（建议锁定）

| 类        | 能力                                           | 落点                                                                                  |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| 远程业务  | 检索等已有能力                                 | `mcp-app-collections`                                                                 |
| 本机编码  | patch / exec / view image / 本机文件 | Runtime 持久化 ToolExecution，经 binding 专属认证 SSE 请求准确 CLI，再由 CLI 原生 executor 执行并以 HTTPS 回传结果 |
| 宿主 HITL | `request_user_input`                  | Deep Agents interrupt → Ink 问答 → `Command.resume`。完整支持暂停、回答与恢复，不增加无价值的策略开关           |

CLI 的本地审批固定为：工作区内只读/搜索自动；patch 先展示 diff 后直接应用；shell 默认逐次确认；Session 可显式启用“工作区内自动执行”；任何工作区外访问始终拒绝。

### Redis 边界（ADR-0008）

- **允许**：可重建的短期 Agent 工作集、窗口/摘要热副本、缓存、lease、fencing、限流、SSE fan-out。
- **禁止**：聊天记录、pending tool/HITL 唯一状态、durable checkpoint、业务事实或任务幂等的唯一真源；用 Redis 替代 RabbitMQ。

---

## 3. 批准目标能力清单（相对 Kodex，除明确排除外全部要做）

| Kodex 能力                                            | 我们对齐方式                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 流式对话                                              | LangGraph stream → Runtime 耐久事件 → 可重放 SSE；断线不取消 Run                              |
| Continue / Retry                                      | model adapter 映射 finish reason；正常 continuation 与有界错误重试分开                        |
| 回合中 steer                                          | 独立 durable steer command queue，在允许的安全边界消费；不拿 `Command.resume` 冒充            |
| Stop                                                  | 显式后端 cancel，传播到远程工具、本机工具和进程树；取消 SSE 订阅不等于 stop                   |
| 工具循环（含动态 MCP 工具）                           | harness + MCP client → `mcp-app-collections`                                                  |
| 会话目录、归档、自动标题                              | Postgres；标题用模型辅助请求，走 runtime                                                      |
| fork / 回退到历史点                                   | Fork 事务复制稳定 PG 前缀为独立 Session；Revert / Revert and edit 以 CAS 推进活动头并保留审计 |
| 上下文压缩（自动 + 强制）                             | harness summarization + PG compact point；保留原始事件，窗口热投影在 Redis                    |
| pending tool 崩溃续跑                                 | PG durable checkpoint + ToolExecution；Redis 清空后仍可恢复                                   |
| HITL：`request_user_input`                            | 宿主（CLI）完成暂停、回答、恢复，runtime 不伪执行                                              |
| MCP 配置、OAuth、工具失效刷新                         | collections + runtime 的 MCP 客户端                                                           |
| 生命周期 Hook                                         | runtime hook（命令仍可配），不绑 Kodex Home                                                   |
| 鉴权与用量                                            | Google OAuth + 库内白名单（`UserPlatform`）；用量从厂商 API 投到控制台                        |
| 内置编码工具（patch / exec / web / image / plan / …） | 远程能力走 MCP；工作区能力走 Local Tool Gateway；plan 是耐久 runtime 状态                     |
| 本地控制台（会话树、历史、设置、路径、patch 渲染）    | Ink `assistant-cli`，不抄 Mosaic                                                              |
| Skills / AGENTS 式请求前缀                            | CLI 在授权 workspace 解析 context snapshot；动态前缀不进聊天，显式 skill 正文按 Turn 耐久保存 |
| 多模型                                                | 用户输入 apiKey、公共 HTTPS baseURL、自由 model，可选 reasoning effort/service tier；运行前校验能力 |

Kodex 没有、我们多做的：Mem0 跨会话长期记忆。这是增强，不是用来替换上面任何一项。

---

## 4. 记忆、执行现场与工具能力分层

| 层                       | 存什么                                                                                      | 真源与恢复规则                                             |
| ------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Postgres                 | Session、Event、Run、Turn、ToolExecution、Interrupt、durable checkpoint、设置、压缩点、审计 | 是；所有已确认结果和等待状态可恢复                         |
| Redis                    | 当前窗口、摘要热副本、active-run lease/fencing、限流、SSE fan-out                           | 否；TTL 或清空后从 PG 重建                                 |
| Mem0 user                | 可复用偏好、稳定项目约定、用户明确要求记住的过滤事实                                        | 记忆条目真源；跨 Session 召回，不替代聊天记录              |
| Mem0 session/run         | 当前任务中经过过滤、值得跨调用保留的事实                                                    | Fork 时复制后独立演进；不等于 Redis 窗口                   |
| MCP / Local Tool Gateway | 外部业务能力与本机工作区能力                                                                | 不是记忆层；调用事实和结果回写 PG                          |

### 4.1 一轮对话

1. 验证用户、Session owner、CLI/workspace binding，并在 PG 幂等接受 Run 和用户消息。
2. 从 Redis 取热窗口；miss 时从 PG 事件和 compact point 重建。
3. 并行检索 Mem0 user + session/run scopes，作为本次调用的临时 context。
4. 组装 AGENTS/Skills snapshot、Mem0 context、短期窗口和当前输入。
5. Deep Agents/LangGraph 执行；每个可观察完成点形成 PG 事件并投影到 SSE/Redis。
6. 回合完成后分类新事实，幂等写入或更新 Mem0；Mem0 失败不回滚对话，但记录可补偿状态。

Mem0 检索结果不写入 Redis 的 human/assistant 原文、不作为聊天消息再次写入 PG，也不被 compact 当作用户原话。记忆条目保存来源、scope、提取时间，并支持 CLI 检查、纠错、删除和过期。API key、token、密码、cookie、OAuth/MCP/model secret、原始对话全文、完整源码、patch、完整 shell 输出和未处理 tool result 一律禁止写入 Mem0。

### 4.2 提交原则

- 对外发布 completed 之前，对应完成事实先提交 PG。
- Redis 更新失败不抹去 PG 成功；下次从 PG 重建。
- Checkpoint 和结构化事件必须有同一提交边界或明确恢复协议，不能无约束双写。
- 需要异步投递时使用 PG transaction + outbox，不用 Redis 锁冒充事务。
- Mem0 写入使用提取幂等键；寒暄、复述和无信息增量不写。

---

## 5. 施工顺序（不是产品档位）

按依赖搭，每一项都要做到可验收的对齐，不允许用 stub 冒充对齐：

1. 固定 Kodex baseline，建立能力、交互和故障验收矩阵。
2. `UserPlatform*`：Google OAuth、助手 User、票据与撤销语义。
3. `AssistantRuntime*`：领域 ID、事件、命令、错误和 SSE cursor。
4. PG Session/Run/Event/Tool/Interrupt/Checkpoint 真源与幂等提交。
5. Redis 热投影、lease/fencing、SSE fan-out 和 PG 重建。
6. Deep Agents/LangGraph 主循环、模型目录、Continue/Retry/compact。
7. 远程 MCP 与 Local Tool Gateway，包括长进程和断线恢复。
8. steer、stop、HITL、fork、归档、自动标题、设置 CAS。
9. AGENTS/Skills snapshot、artifact、image/web/plan 等完整工具能力。
10. Ink 控制台完整交互。
11. Mem0 user/session 分层、来源/纠错/删除与失败补偿。
12. 观测、限流、安全审计、故障注入和跨实例验收。

---

## 6. 核心领域模型与 Run 状态机

Postgres 不能只建 `session/message`。至少要表达下列对象，精确表名在 OpenSpec 中固化：

| 对象                       | 责任                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `AssistantSession`         | owner、标题、归档、默认设置、fork lineage                           |
| `AssistantRun`             | 一次由后端持有的完整运行，独立于 HTTP/SSE 连接                      |
| `AssistantTurn`            | 逻辑用户回合，可包含多个模型 continuation 和工具循环                |
| `AssistantEvent`           | 有序、耐久、可投影的消息、reasoning、tool、plan、compact 和状态事件 |
| `AssistantToolExecution`   | `toolCallId`、执行位置、attempt、lease、结果、幂等状态              |
| `AssistantInterrupt`       | HITL 类型、payload、状态、回答、恢复 checkpoint                     |
| `AssistantCheckpoint`      | LangGraph 执行现场，用于崩溃、HITL 和 pending tool 恢复             |
| `AssistantArtifact`        | 图片、patch、命令输出附件及其 owner、MIME 和存储引用                |
| `AssistantSettingsVersion` | Session 设置版本和原子比较更新                                      |
| `AssistantClientBinding`   | 用户、设备、CLI 实例和 workspace capability 绑定                    |

每个 Session 使用单调递增 `eventSequence`。耐久事件至少携带 `eventId`、`sessionId`、`runId`、`turnId`、`sequence`、`type`、`occurredAt` 和版本化 payload。

### 6.1 Run 状态机

```text
Queued ──► Running ──► Completed
              │  ├──► WaitingForLocalTool ──► Running
              │  ├──► WaitingForMcpTool   ──► Running
              │  ├──► WaitingForHuman    ──► Running
              │  ├──► Compacting         ──► Running
              │  ├──► Failed
              │  └──► Cancelling ──► Cancelled
              └───────────────────────────► Failed
```

Run 由后端 owner scope 持有，不绑定创建它的请求或 SSE 连接。同一 Session 默认只有一个 active Run；使用有过期时间的 lease 和单调 fencing token，旧实例不能在失去所有权后继续提交。

### 6.2 六种独立命令语义

| 动作        | 语义                                                     |
| ----------- | -------------------------------------------------------- |
| `resume`    | 从已持久化 interrupt/checkpoint 恢复，不代表新增用户消息 |
| `steer`     | Run 活跃时排队注入用户输入，在安全边界按序消费           |
| `continue`  | 模型请求正常结束但逻辑 Turn 仍需继续，不计作错误重试     |
| `retry`     | 可重试失败的有界再次尝试，保存 attempt 和原因            |
| `stop`      | 取消后端 Run、远程工具、本机工具和进程树，并发布终态     |
| `reconnect` | 客户端重新订阅事件，不创建或重放业务命令                 |

所有 mutation 都带 command id/idempotency key。Settings 使用版本化 CAS；响应丢失时不能盲目重放结果未知的写入。

### 6.3 Retry 分类

- provider 429/5xx/短暂网络错误：有界指数退避，尊重 provider retry advice。
- 正常 continuation：同一 Turn 新模型 attempt，不算错误。
- 工具业务错误：作为可见 tool result 交给模型，不自动重复副作用。
- MCP transport 失败：只在确认未执行或工具声明幂等时重试。
- 本机工具结果未知：保持 Unknown/Pending，等待准确 CLI 查询或人工处理。
- 非预期实现错误：Run 失败并保留诊断，不无限续跑。

### 6.4 fork / revert / delete

Fork 在事务内复制目标 sequence 之前已提交的 PG 历史、settings、context snapshot、compact lineage 与 checkpoint，生成可独立读取和删除的新 Session；lineage 只用于展示和审计，不建立共享 message DAG。pending tool、interrupt 和之后输出不复制。user scope Mem0 仍由同一 owner 共享；session scope Mem0 复制到目标后独立演进；artifact reference 复制，immutable blob 仅在最后一个引用删除后回收。

`Revert to here` 以版本 CAS 将原 Session 活动头移动到稳定事件点，保留被撤下分支用于审计；`Revert and edit` 在同一原子命令中回退并提交编辑后的用户输入，开始新 Run。Archive 可恢复，Delete 不可逆；删除源 Session 不得损坏 Fork，删除 Fork 也不得损坏源。

---

## 7. HTTP + 可重放 SSE

建议资源形态如下，精确路径和错误联合由 OpenSpec 固化：

```text
POST   /assistant/sessions
GET    /assistant/sessions
POST   /assistant/sessions/:id/runs
POST   /assistant/runs/:id/commands/steer
POST   /assistant/runs/:id/commands/stop
POST   /assistant/runs/:id/interrupts/:interruptId/resolve
POST   /assistant/runs/:id/tool-executions/:toolExecutionId/result
GET    /assistant/sessions/:id/events?after=<sequence>
GET    /assistant/runs/:id/stream
POST   /assistant/sessions/:id/forks
POST   /assistant/sessions/:id/revert
POST   /assistant/sessions/:id/revert-and-edit
PATCH  /assistant/sessions/:id/settings
```

SSE 必须满足：

- 事件带 schema version、`eventId` 和 `sequence`。
- 支持 `Last-Event-ID` 或显式 `after` cursor。
- 重连先从 PG 补齐，再切到 Redis Pub/Sub 或进程内 fan-out。
- SSE 断线不取消 Run；CLI 显式调用 stop。
- heartbeat 与业务事件分开；代理缓存关闭。
- 慢消费者超限后断开并按 cursor 重连，不静默丢事件。
- 客户端按 `eventId` 去重，以 `sequence` 检测缺口。
- prompt 通过带幂等键的 POST body 创建 Run，不放 GET query 或访问日志。

SSE 可投影成 AI SDK UI stream，但耐久事件 schema 归 `AssistantRuntime*` 所有。

---

## 8. Local Tool Gateway

Runtime 在服务器，不能直接访问 NAT 后面的本机工作区。采用持久化 Host Tool Gateway；它是产品协议，不是本机 MCP：

```text
Agent 产生 local tool call
  → Runtime 在 PG 创建 ToolExecution(Pending)
  → binding 专属认证 SSE 向准确 CLI 发布 local_tool.requested
  → CLI 校验用户、设备、Session、workspace capability 和审批策略
  → CLI 调用本机原生 tool executor
  → CLI 以 toolExecutionId + attempt + idempotency key 通过 HTTPS POST ack/result
  → Runtime 以 fencing/状态 CAS 原子接受一次结果
  → PG 提交 completed event
  → LangGraph 从 durable checkpoint 恢复
```

必须定义：

- CLI instance 注册、心跳、重连和解绑。
- Session/Run 绑定准确 CLI 与 workspace root，不误投同用户另一台设备。
- canonical path、symlink escape 防护和 workspace allowlist。
- 命令审批、危险命令策略、环境变量与凭据脱敏。
- stdout/stderr 分块、输出上限、backpressure 和终端编码。
- `exec_command` 长进程 session、`write_stdin`、最终输出读取和进程树终止。
- CLI 离线时 Run 进入 `WaitingForLocalTool`；接管前不允许其他实例执行。
- 结果未知不自动重跑非幂等工具。
- stop 传播到 CLI；超时后仍准确表达“取消结果未知”。
- Session SSE 不广播 tool args、文件内容或本地执行请求；只提供经脱敏的产品状态。
- 工作区内只读/搜索自动；patch 展示 diff 后应用；shell 默认确认；Session 可选择工作区内自动；工作区外始终拒绝。

远程 MCP、本机编码工具和宿主 HITL 是三种执行位置，不能用一个“全走 MCP”口号抹平信任与生命周期差异。

---

## 9. Context、compact 与模型目录

### 9.1 AGENTS / Skills

Runtime 读不到本机工作区。Run 开始时由 CLI：

1. 在授权 workspace 内解析适用的 `AGENTS.md` 层级和显式 skill。
2. 发送带内容 hash、相对来源和 workspace binding 的 context snapshot。
3. Runtime 校验大小、类型和绑定后组装请求。
4. 动态前缀不作为聊天消息保存；显式选择的 skill 正文按 Turn 保存耐久输入快照，保证恢复和 fork 不依赖未来文件变化。

Deep Agents 自带 Skills 不自动等同于 Kodex-style skills；通过 adapter 和统一 catalog 显式映射。还要定义优先级、最大大小、刷新、路径脱敏和 prompt injection 边界。

### 9.2 compact

Deep Agents summarization 提供算法，产品拥有语义：

- 按当前模型 context window 和预算自动触发，也支持强制 compact。
- `Compacting` 是可观察状态，失败不能伪装成功。
- PG compact point 记录覆盖到的 `eventSequence`、摘要、保留项和 token metadata。
- 原始 PG 事件继续保留，可查看、审计和 fork。
- pending tool、未完成 interrupt、不完整 assistant item 不进入稳定摘要。
- tool call/result 成对保留；换模型后重算预算。
- Mem0 注入是临时 context，不当作用户原话反复摘要。

### 9.3 Model Catalog

用户在 CLI 以遮罩输入配置自己的 `apiKey`、公共 HTTPS `baseURL` 和自由文本 `model`，并可选填 `reasoning effort`、`service tier`。Runtime 在初始请求、redirect 和每次实际模型连接前重新解析并拒绝 loopback/private/link-local/metadata 地址，且在拒绝前不发送 key。Runtime 加密保存 key，Session 只保存连接引用与默认 model，Run 固化实际参数快照；Redis 不保存明文 secret。这些是 LangChain `ChatOpenAI`/model-client 参数，不是 `createDeepAgent` 参数。

`AssistantRuntimeModelCatalog` 至少声明：context window、output limit、streaming、tool calling、parallel tools、stable tool-call id、reasoning、image input、structured output、usage metadata、prompt cache、service tier 和 provider search。

模型不支持必需能力时，在选择时禁用或显式降级；不能运行中静默丢 tool、reasoning、image 或 usage。Model adapter 将 provider finish reason 映射成产品 Finish/Continue/Retryable/Failure，LangGraph node retry 不替代该映射。

---

## 10. MCP、鉴权与数据安全

### 10.1 MCP

- MCP 配置、启停、OAuth 状态和 secret reference 由 Runtime/PG 持有，事件不保存明文凭据。
- 用户只能配置公共网络 HTTPS MCP。服务器端与工作站端 stdio MCP 都不支持；本机编码工具只走 Local Tool Gateway。
- 初始请求、每次 redirect 与实际连接都重新解析并拒绝 localhost、loopback、private、link-local 和 cloud metadata 目的地址，避免 DNS rebinding/SSRF 绕过。
- 定义连接复用、OAuth callback、失效刷新、catalog version 和 schema snapshot。
- 大工具集定义检索/延迟暴露策略；provider 不支持时显式回退。
- MCP result 保存完整结构化 envelope 和 artifact reference，不只压成文本。

### 10.2 资源所有权

OAuth 成功不等于可以访问任意数据。每次访问校验：

- Session、Run、Event、Artifact、Settings 的 owner。
- CLI instance 和 workspace binding。
- MCP 配置、provider credential 和 Mem0 scope owner。
- fork source 读取权与 target owner。

### 10.3 Secret 与删除

- provider key、MCP OAuth token 加密保存，日志和事件只存 reference。
- prompt、tool args、stdout/stderr、trace 限长并脱敏。
- Archive 可恢复；Delete 不可逆。Session 删除定义 event/checkpoint/tool/private artifact 引用级联，immutable blob 到最后引用才回收；Mem0 删除单独执行并报告部分失败，已独立 Fork 不受影响。
- Mem0 条目保存来源、scope、时间，并支持纠错、删除、过期；模型推断不是不可更改用户事实。

---

## 11. Hook、subagent 与 Ink 控制台

### 11.1 基线纠正

- 固定 Kodex baseline 的 RPC 生产路径注入 `NoOpKodexHooks`；因此配置 Hook 是 Node 增强，不冒充 Kodex-current。Node 仍完整实现 `PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`Stop`、`PreCompact`、`PostCompact`、`UnhandledError` 七类有序 Hook，并通过精确 Local Tool Gateway binding 执行 workspace 命令。
- 仅实现 Deep Agents 真正的 child Run SubAgent。Kodex Suggested Sessions 已经明确批准排除，不用它冒充 SubAgent，也不实现其批量 Session 流程。
- Subagent 继承或收窄 owner、workspace、tool permission、memory scope 和预算，不能扩大权限。
- Hook 配置按 Run 固定版本快照；事件、输入输出、顺序、有限超时、控制/通知失败、取消和 unknown-result 语义独立契约化，Hook 不得扩权或改写已提交历史。

### 11.2 Ink 必须实现的产品交互

- 登录、刷新、logout。
- Session tree、创建、打开、重命名、归档、删除、fork、revert、revert and edit。
- 大历史有界分页、准确顺序、断线 replay。
- text/reasoning/tool/plan/compact/HITL/subagent work 差异化渲染。
- 流式 item 与 PG durable item 去重合并。
- Composer submit、active Run steer、stop。
- workspace/path picker、patch diff、图片、artifact、命令输出。
- `exec_command`/`write_stdin` 长进程交互。
- MCP、用户自有模型连接/模型/运行参数、Session 设置和版本冲突反馈。
- 完整保留 Kodex 的 History/Terminal sidebars 与相应交互；布局、输入行为等纯 UI 偏好只保存在本机。
- 键盘、鼠标、焦点、弹窗、窄终端和 resize。
- CLI 退出只解绑客户端；除非显式 stop，后端 Run 继续或等待本机工具。

Ink 只是 renderer，不能在 CLI 再建 Session/Run 真源。

---

## 12. 故障恢复与完成验收

以下任一项不成立，就不能宣称批准目标范围已完成：

1. Runtime 在模型输出中途崩溃，重启后没有伪造完成项。
2. Runtime 在工具执行前后崩溃，不会无条件重复非幂等副作用。
3. Redis 清空后，历史、设置、fork、等待中的 HITL/pending tool 可从 PG 恢复。
4. SSE 任意断开重连，CLI 能检测并补齐事件缺口。
5. CLI 离线时本机工具保持等待；只由准确实例接管。
6. 两个 Runtime replica 竞争同一 Run，只有最新 fencing owner 能提交。
7. settings 并发更新不覆盖无关字段，也不盲目重放未知结果。
8. compact 中断后能识别成功、失败或待恢复，不产生半个摘要真源。
9. Mem0 不可用时对话仍可完成，并准确记录记忆抽取未完成；恢复后幂等补偿。
10. PG 成功、Redis 更新失败时，下次从 PG 重建，不丢失已确认内容。
11. 本机长进程在 stop/CLI crash/Runtime crash 下都有明确、可观察的终态。
12. 模型不支持某能力时，选择阶段可见，运行中不静默弱化。

当前 `assistant-runtime-service` 的 ping/echo SSE 与 `assistant-cli` 命令只是编译和传输脚手架，不代表模型、PG/Redis/Mem0、鉴权、可重放事件、状态机、MCP、本机工具、Ink 或 compact/fork/HITL 已实现。

后续实施必须走 OpenSpec。框架、数据库、协议、部署和信任边界的最终决策需要新增或替代 ADR；本 proposal 不构成 Apply 授权，也不把提议写成当前架构事实。

### 12.1 最终功能交付清单

下面是发布前逐项签收清单；状态与证据写入 companion capability ledger，本页只保留完整性入口。

| 功能组         | 必须签收的 ID                                                 | 当前方案状态 |
| -------------- | ------------------------------------------------------------- | ------------ |
| 身份与安全     | CAP-001、CAP-002、CAP-031                                     | Specified；未实现 |
| Session 与运行 | CAP-003、CAP-004、CAP-007、CAP-008、CAP-009、CAP-019、CAP-020 | Specified；未实现 |
| 历史与传输     | CAP-005、CAP-006、CAP-025、CAP-028                            | Specified；未实现 |
| 模型与上下文   | CAP-010、CAP-018、CAP-021、CAP-024                            | Specified；未实现 |
| 工具与人工协作 | CAP-011、CAP-012、CAP-013、CAP-014、CAP-015、CAP-016          | Specified；未实现 |
| 状态与记忆     | CAP-017、CAP-022、CAP-023、CAP-030                            | Specified；未实现 |
| 控制台         | CAP-026、CAP-027                                              | Specified；未实现 |
| 运维与交付     | CAP-029、CAP-032                                              | Specified；未实现 |

发布收据必须逐项给出：OpenSpec requirement、实现文件、迁移、自动化测试、故障注入结果、人工 CLI 验收、未覆盖平台和已知风险。任何一项仍为 Proposed/Specified/Implemented/Blocked 时，都不能使用“批准目标范围完成”结论；即使全部 Verified，也不能在 Suggested Sessions 仍被排除时使用“精确/完整 Kodex 对齐”。

---

## 13. 一句话

**用 Node 实现经确认的目标能力，而不是复刻 Kodex 的实现：PostgreSQL 保存耐久事实与 checkpoint，Redis 保存可重建热状态，Mem0 保存抽取的长期记忆，Deep Agents/LangGraph 负责 Agent harness，本机工具通过可审计的 CLI Gateway 执行，Ink 负责完整控制台；Suggested Sessions 是明确披露的功能差异。**
