# Node Assistant Runtime 能力台账与验收记录

> 日期：2026-10-05
> 状态：OpenSpec Apply companion / 不是 ADR / 以证据记录实施与验收状态
> 主方案：[`2026-10-05-node-agent-runtime-plan.md`](./2026-10-05-node-agent-runtime-plan.md)
> 用途：固定能力边界、连接 OpenSpec 与实现证据，并由独立 subagent 在后续编码会话后执行功能验收。

## 功能点总览（开头清单）

1. `CAP-001`～`CAP-003`：身份准入、资源所有权、Session 生命周期/目录/标题。
2. `CAP-004`～`CAP-009`：Run/Turn 状态机、耐久历史、SSE replay、Continue/Retry、steer、stop/cancel。
3. `CAP-010`～`CAP-016`：Model Catalog、远程 MCP、Local Tool Gateway、长进程、编码工具、HITL、subagent。
4. `CAP-017`～`CAP-024`：崩溃恢复、compact、fork、settings CAS、AGENTS/Skills、Redis/PG、Mem0、Hook。
5. `CAP-025`～`CAP-032`：artifacts/images、Ink 会话与操作界面、usage、可观测审计、多副本一致性、删除/隐私/密钥、脚手架/发布/总验收。

本文的 `CAP-*` ID 是稳定产品标识。后续可把一项拆成 OpenSpec requirements 和 tasks，但不得重用、重排或为同一功能另建冲突编号。

## 1. Kodex baseline 固定规则

### 1.1 已固定 baseline

- **来源**：独立 Kodex checkout `/Users/temptrip/Desktop/Project/Kodex`。
- **固定 commit**：`3008a6de9f178cda7cd63123a0261d75013f772d`。
- **核验回执**：2026-10-05（Asia/Shanghai）现场运行 `git -C /Users/temptrip/Desktop/Project/Kodex rev-parse HEAD` 返回上述完整 SHA；`git status --short` 无输出；branch 为 `main`。
- **源码声明版本**：该 commit 的构建配置声明 `0.4.9`（`buildSrc/src/main/kotlin/kodex.kmp-shared.gradle.kts` 与 `buildSrc/src/main/kotlin/KodexHostKmp.kt`）；本次未运行已发布二进制，因此不把外部 release artifact 状态混入源码 baseline。
- **参考漂移**：BuildKodex 的 `Kodex` gitlink 仍指向 `821b66275aae2f0a9541fa2e9e03023d875c30b5`，与已固定 checkout 不同；不得把该 gitlink 或 checklist 的目标设计混入本 baseline 的当前产品事实。

本台账自本次核验起只以该完整 SHA 判断 `Kodex-current` 与 `Kodex-unwired`。BuildKodex gitlink 仅作为参考漂移记录，不构成第二 baseline。任何 baseline 变更都要新增日期、旧/新 SHA、工作树状态、能力差异和验收影响审计，不得就地改写历史结果。

### 1.2 来源分类

| 标记               | 含义                                                                       | 验收处理                                           |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------------- |
| `Kodex-current`    | 固定 baseline 的当前产品已接线能力                                         | Node 必须保留产品语义；技术实现可替换              |
| `Kodex-unwired`    | Kodex 有代码/设计，但固定 baseline 未接入当前生产路径或仍待运行核验        | 不得当作既有对齐事实；应单独决定是否纳入 Node 产品 |
| `Node-enhancement` | 网络服务化、多副本、Mem0 或真正 subagent 等 Node 方案新增能力/必需安全边界 | 不能抵消任何 Kodex-current 对齐项                  |
| `Mixed`            | 同一 ID 中同时有对齐核心与 Node 扩展                                       | 验收证据必须分别覆盖两部分                         |

Baseline 事实优先级：固定 commit 上的可运行路径与测试 > 当前 README > BuildKodex checklist。Checklist 用于解释已确认语义和未接线边界，不单独证明代码已上线。

## 2. 状态与晋级门槛

每个能力只能使用以下状态：

| 状态          | 含义                                 | 进入门槛                                                                       |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| `Proposed`    | 只有方案意图                         | 本台账有边界、风险和预期验收；不要求已有代码                                   |
| `Specified`   | OpenSpec 已定义可测语义              | 存在通过 strict validation 的 requirement/scenario，且追溯到 `CAP-*`           |
| `Implemented` | 生产路径已完整接线                   | 有精确代码/迁移/配置证据和自动化测试；不允许 stub/no-op/fixed response         |
| `Verified`    | 在验收环境证明产品语义               | 先满足 Implemented，再完成本台账的 E2E/故障注入/人工交互验收，并保存可复查回执 |
| `Blocked`     | 有明确、当前不可绕过的外部或决策阻塞 | 写明 blocker、owner、解锁条件和最后核验日期；不得用于表示“尚未开发”            |

晋级只能由证据驱动，不得因为安装了架构、编译通过、创建了接口或写了 mock 就标记 `Implemented`。回归失败、生产接线被移除或证据无法重现时必须降级。

### 2.1 证据格式

- **OpenSpec requirement**：记录 change/spec 路径、requirement 标题与 scenario，不只写 task checkbox。
- **实现证据**：记录生产入口、关键类/模块、schema/migration、配置和实际接线链路。
- **验收证据**：记录测试名称、命令、环境、日期、结果/回执。静态 config 不等于运行验收。
- **证据空缺**：用 `—` 或“待产生”，不得写成已完成。

## 3. 能力台账

### CAP-001 身份准入

- **来源**：`Node-enhancement`（网络 runtime 的必需信任边界）。
- **Node 设计落点**：`apps/user-platform-service`（待建）负责 Google OAuth Authorization Code + PKCE、助手白名单和五分钟 access token；`assistant-runtime-service` 本地验票，CLI 用 loopback callback 登录。停用立即阻止签发/refresh，既有 token/stream 最迟在到期时结束；一期不做撤销总线、deny list 或逐请求 introspection。
- **OpenSpec requirement**：`Assistant identity admission` SHALL 要求 OAuth 成功后再校验启用的 assistant user；未登录、未在名单、已停用或 token 已过期均返回 401。
- **实现证据**：待提供 UserPlatform 持久化、OAuth callback、token verifier/rotation/revocation 代码与 runtime guard 接线。
- **验收证据**：E2E 覆盖首次登录、非白名单、停用后旧票据失效、CLI callback state/PKCE 校验和 SSE 连接验权。
- **状态**：`Specified`。

#### 2026-10-05 Apply 基础契约证据（不触发能力晋级）

- 已完成任务 `2.3`～`2.6` 与 `3.2`：Runtime/CLI 分层边界、三端环境校验、managed-only Mem0、HTTPS MCP/客户端边界、关联标识与版本元数据，以及 `UserPlatform*` OAuth/准入/五分钟 EdDSA token wire schemas。
- 自动化证据：contracts 26 tests；Runtime 29 unit + 2 HTTP/SSE E2E；CLI 23 tests（含 TTY/非 TTY 命令 harness 与真实启动门）以及 packaged CLI 缺配置拒绝；UserPlatform 19 unit + 3 HTTP E2E；相关 typecheck、lint、build 全部通过。Runtime HTTP E2E 断言同一请求的 header、响应体与结构化日志使用同一个 correlation ID。
- 这些证据只证明基础契约和诊断路径。OAuth 交换、白名单持久化、签发/验票、所有权、真实 Runtime、Mem0 adapter、MCP 执行与 Ink 产品 UI 仍未实现，因此 CAP-001、CAP-023、CAP-026、CAP-029、CAP-031、CAP-032 均保持 `Specified`。
- 后续任务 `3.3`、`3.4` 增加 Session/Run/Turn/attempt/commands/settings/compact/fork/revert 合约，以及含 payload version 的耐久事件、heartbeat/event/resumable-close SSE frame 和十类事件 payload；contracts 当前为 9 files / 45 tests。它们仍是 wire contract，不是持久化或流式实现，相关 CAP 状态不晋级。
- 任务 `3.5` 增加用户自有 HTTPS provider connection、自由模型名、可选 reasoning/service tier、三态能力目录、受限 context snapshot、managed-only Mem0 operation、七类有序 Hook 和显式 Unavailable usage/account contracts；contracts 当前为 10 files / 55 tests。真实 provider、Mem0、Hook 与 usage adapter 尚未接线，相关 CAP 继续保持 `Specified`。
- 任务 `3.8` 冻结了 34 个 v1 代表性静态兼容样本（28 正例、6 个未知版本/联合分支/非 HTTPS 负例），覆盖 16 个跨进程协议族；CLI、Runtime、UserPlatform 分别从已构建的 `@repo/contracts/dist/index.js` 读取同一清单并履行生产者/消费者角色，专用 CI 从 frozen install 运行兼容性、lint、类型、构建、OpenSpec 与凭证扫描门禁。该证据证明代表性 wire surface 的跨包兼容和公共 schema 单元回归，不声称穷举每个 union 分支；OAuth、Session、SSE、Mem0、MCP、工具与持久化的生产实现仍未接线，所有关联 CAP 继续保持 `Specified`。
- 任务 `4.1` 增加了两套彼此独立且不会随服务启动隐式执行的 TypeORM migration：`user_platform` 拥有 Assistant user/access grant，`assistant_runtime` 拥有 Session/settings/command/Run/Turn/model attempt/steer，共 9 张表。编译后 DataSource 已在一次性 PostgreSQL 16 容器完成独立 up、合法链插入、非法版本/hash/state/time/cross-owner 拒绝、空二次执行、down 与再次 up，并由 CI 的真实 PostgreSQL service 固定执行；Runtime 不外键或查询 UserPlatform。
- 任务 `4.2` 在 Runtime 增加 15 张耐久扩展表（累计 22 张），覆盖 event/outbox/checkpoint/compaction、tool/interrupt、artifact/reference、context snapshot、MCP/client binding、Mem0 operation 及关系型事件 provenance、deletion receipt 和 audit。真实 PostgreSQL 16 回归验证完整合法链、owner/Session/Run 复合血缘、Fork 共享 immutable artifact、ToolExecution 完整终态证据、question/approval interrupt 矩阵与 4096 字符原因、compaction 事件类型、owner/session-scoped Mem0 extract 的精确 source Run/Event 血缘、合同一致的严格删除步骤/cleanup/引用计数与 offset 时间、空二次执行、仅回退 4.2、全量 down 和再次 up；三轮独立复审发现的缺口均已固化为数据库回归。Repository 和生产接线仍未实现，因此相关 CAP 继续保持 `Specified`。
- 任务 `4.3` 以两条独立 forward migration 增加八类产品唯一性：Google subject、owner command idempotency、Session sequence、全局 event identity、每 Session 一个 active Run、每 execution attempt 一个 terminal tool result、owner-scoped interrupt resolution command/idempotency，以及每 owner/CLI/workspace 一个 Active/Offline current binding。约束目录、正负插入、4.3-only down、全量 down/up 均由真实 PostgreSQL 16 验证；唯一性不冒充 gap-free sequence、terminal interrupt CAS、lease/fencing 单调性或 repository 行为，相关 CAP 仍保持 `Specified`。

### CAP-002 资源所有权

- **来源**：`Node-enhancement`。
- **Node 设计落点**：Runtime application guard + repository query scope，对 Session/Run/Event/Artifact/Settings/MCP credential/Mem0 scope/CLI binding 逐资源校验 owner；不以“已登录”替代授权。
- **OpenSpec requirement**：`Assistant resource ownership` SHALL 在读、写、fork、stream、tool result 提交和 artifact 下载时校验 owner 及 client/workspace binding，并禁止通过 ID 枚举跨用户访问。
- **实现证据**：待提供 schema owner keys、repository filters、guards/policies 和无绕过入口的依赖图。
- **验收证据**：两用户交叉 ID 的 API/SSE/artifact/fork/Mem0/MCP 负向 E2E，并验证错误不泄露资源是否存在。
- **状态**：`Specified`。

### CAP-003 Session 生命周期、目录与标题

- **来源**：`Kodex-current`。
- **Node 设计落点**：PG `AssistantSession` 及 catalog query；创建、打开、重命名、归档/取消归档、删除、自动标题、created/updated/running 状态均由 runtime 持有，CLI 只保留导航投影。
- **OpenSpec requirement**：`Assistant session lifecycle` SHALL 定义幂等性、结果未知时的重试限制、归档与 stop/delete 差异、目录排序/分页及自动标题冲突规则。
- **实现证据**：待提供 Session migration/entity/repository/service/controller、title worker 和 CLI catalog consumer 实际接线。
- **验收证据**：生命周期 E2E；并发重命名/自动标题；归档不停 Run；删除的 owner 、running 与部分失败语义。
- **状态**：`Specified`。

### CAP-004 Run/Turn 状态机

- **来源**：`Kodex-current` 语义的 Node 显式化。
- **Node 设计落点**：PG `AssistantRun`/`AssistantTurn`，显式表达 Queued、Running、WaitingForLocalTool、WaitingForMcpTool、WaitingForHuman、Compacting、Cancelling 及终态；Run 由后端持有，不绑定 HTTP/SSE 请求。
- **OpenSpec requirement**：`Durable run state machine` SHALL 列举合法转换、同 Session active Run 策略、Turn/model attempt/tool loop 边界、终态及非法命令错误。
- **实现证据**：待提供状态联合、transition service、DB constraints/version、command handlers 和 Deep Agents adapter 接线。
- **验收证据**：状态转换 contract tests + 真实 Run E2E，覆盖重复命令、连接断开、并发 Run 和所有终态。
- **状态**：`Specified`。

### CAP-005 耐久事件历史

- **来源**：`Kodex-current`（替代六 timeline 的产品语义）。
- **Node 设计落点**：PG append-only `AssistantEvent`，每 Session 单调 `sequence`，保存 text/reasoning/tool/plan/compact/interrupt/status/settings/usage 的版本化 payload；窗口化读取，不将 Redis 投影当真源。
- **OpenSpec requirement**：`Durable assistant event history` SHALL 定义序列分配、提交后可见性、并行 tool completion 顺序、pending/stable 差异、有界分页和 payload 升级。
- **实现证据**：待提供 event schema/migration、原子 append API、projector 及历史 query。
- **验收证据**：稀疏/大历史分页、并发追加、工具乱序完成、重启还原、不完整输出不伪装稳定事件的整合测试。
- **状态**：`Specified`。

### CAP-006 SSE 流式与 replay

- **来源**：`Mixed`（流式对齐 + 网络断线 replay 增强）。
- **Node 设计落点**：`AssistantRuntime*` 事件协议；先从 PG 按 cursor 补齐，再切 Redis Pub/Sub/fan-out；心跳与业务事件分离，客户端按 eventId 去重、sequence 检缺。
- **OpenSpec requirement**：`Replayable assistant stream` SHALL 定义 schema version、event ID/sequence、`Last-Event-ID`/`after`、补齐与 live handoff、慢消费者、心跳、代理缓存和“断流不 stop”。
- **实现证据**：当前只有 `/assistant/stream` echo stub，无耐久事件/cursor/replay，**不是实现证据**；待真实 event stream adapter 和 CLI parser/store 接线。
- **验收证据**：流中任意断网、丢 Pub/Sub、重复包、sequence gap、慢客户端与 runtime 重启的 E2E/故障注入。
- **状态**：`Specified`。

### CAP-007 Continue / Retry

- **来源**：`Kodex-current`。
- **Node 设计落点**：Model adapter 把 provider finish reason 映射为 Finish/Continue/Retryable/Failure；正常 continuation 与网络/429/5xx 有界重试、工具业务失败及结果未知分开。
- **OpenSpec requirement**：`Continuation and retry semantics` SHALL 定义 provider mapping、attempt 记录、计数重置、backoff/retry advice、重试上限和禁止自动重放非幂等副作用。
- **实现证据**：待提供 provider adapters、retry policy、attempt persistence 和 harness loop 接线。
- **验收证据**：finish reason 矩阵测试，Continue 不占错误重试额度，429/5xx 耗尽可见，tool result unknown 不重放。
- **状态**：`Specified`。

### CAP-008 steer

- **来源**：`Kodex-current`。
- **Node 设计落点**：PG durable steer command queue，在活跃 Run 的可安全追加边界按序原子领取；不用 LangGraph `Command.resume` 代替。
- **OpenSpec requirement**：`Active-run steering` SHALL 定义可接受状态、排队顺序、command idempotency、并发 append/take 归属、stop/interrupt 竞争和恢复。
- **实现证据**：待提供 command table/queue、CAS claim、runtime safe-boundary adapter 和 CLI composer 的 active-run 分流。
- **验收证据**：运行中连续/并发 steer、非法状态不消费、runtime 崩溃后仅消费一次、与 stop 竞争的 E2E。
- **状态**：`Specified`。

### CAP-009 stop / cancel

- **来源**：`Kodex-current`。
- **Node 设计落点**：显式 stop command 使 Run 进入 Cancelling，向 model request、MCP、Local Tool Gateway 和本机进程树传播，最终发布 Cancelled 或“取消结果未知”。
- **OpenSpec requirement**：`Run cancellation` SHALL 区分 SSE unsubscribe、CLI exit、stop、Session delete 和 runtime shutdown，定义取消传播、超时、清理、幂等及终态。
- **实现证据**：待提供 cancellation owner/token、command handler、provider/MCP/local process adapters 和 durable final event。
- **验收证据**：在 model delta、remote tool、local tool、HITL、compact 每个阶段 stop，验证进程树、资源和唯一终态。
- **状态**：`Specified`。

### CAP-010 Model Catalog 与多模型

- **来源**：`Mixed`（Kodex catalog/context budget + Node 多厂商）。
- **Node 设计落点**：用户在 CLI 配置遮罩 `apiKey`、公共 HTTPS `baseURL`、自由文本 `model` 以及可选 `reasoning effort`/`service tier`。Runtime 对 initial/redirect/actual-connect 都做 DNS/SSRF 重校验后才发送 key；加密 key，Session 保存连接引用和默认 model，Run 固化实际参数；Redis 不存明文。`AssistantRuntimeModelCatalog` 管理能力与显式降级。
- **OpenSpec requirement**：`User-owned model connection` 与 `Capability-aware model catalog` SHALL 定义连接所有权、SSRF 防护、加密/脱敏、运行参数快照、未知模型策略、预算计算、provider finish/usage 归一及禁用/显式降级。
- **实现证据**：待提供 catalog schema/service、provider adapters、refresh owner、selection validation 和 context-budget 共用路径。
- **验收证据**：至少两类 provider 的 catalog/stream/tool/usage 端到端；不支持 tool/image/reasoning 时选择阶段可见。
- **状态**：`Specified`。

### CAP-011 远程 MCP

- **来源**：`Kodex-current`。
- **Node 设计落点**：开发/测试时 Runtime 通过 `http://localhost:9021` 直连仓库内 `mcp-app-collections`；生产环境及用户配置的远程 MCP 只接受公共 HTTPS。远程连接在初始请求、redirect 和实际连接时均重新解析并阻断 loopback/private/link-local/metadata 地址。服务器和工作站 stdio MCP 均不支持。
- **OpenSpec requirement**：`Managed remote MCP tools` SHALL 定义增删改启停、OAuth login/logout/refresh、connection identity/reconnect、catalog generation、工具搜索/延迟暴露、result artifact 和密钥脱敏。
- **实现证据**：当前 ping 只返回 `MCP_COLLECTIONS_URL`，不是 MCP 客户端实现；待 manager/client/catalog/OAuth 与 harness tool adapter 接线。
- **验收证据**：真实 collections 调用、OAuth 刷新、断线重连保留上代 catalog、配置变更失效、大结果/artifact 的 E2E。
- **状态**：`Specified`。

### CAP-012 Local Tool Gateway

- **来源**：`Node-enhancement`（为保留 Kodex 本机工具能力必须新增的网络边界）。
- **Node 设计落点**：PG `AssistantClientBinding` + `AssistantToolExecution`；Runtime 经 binding 专属认证 SSE 耐久投递到准确 CLI，CLI 原生 executor 校验 capability/审批后执行，再经 HTTPS ack/result 回传。Session SSE 不广播工具参数或文件内容。
- **OpenSpec requirement**：`Durable local tool gateway` SHALL 定义注册、心跳、绑定、租约、请求/结果协议、掉线等待、接管、结果 CAS、unknown 和权限不扩大；`Local approval policy` 固定只读自动、patch 展示 diff 后应用、shell 默认确认、可选 Session 内工作区自动、工作区外始终拒绝。
- **实现证据**：待提供 DB schema、binding/gateway services、SSE request + result API、CLI executor/approval 及 checkpoint resume 链路。
- **验收证据**：同用户多设备不误投，CLI 离线/重连，重复结果，lease 丢失，错 workspace，结果未知和 runtime 崩溃。
- **状态**：`Specified`。

### CAP-013 `exec_command` / `write_stdin` 长进程

- **来源**：`Kodex-current`。
- **Node 设计落点**：CLI-owned process registry，随机 live handle 与 durable ToolExecution 分离；支持 PTY/非 PTY、stdout/stderr chunk、backpressure、`write_stdin`、exit code、最终输出读取和进程树终止。
- **OpenSpec requirement**：`Interactive local process sessions` SHALL 定义 handle 生命周期、completed 与可读尾输出区别、stdin/resize/terminate、编码、输出上限和 crash/stop 终态。
- **实现证据**：待提供 CLI process owner/adapter、Gateway protocol、runtime tool definitions 和 Ink terminal interaction 接线。
- **验收证据**：交互 shell、大输出/backpressure、完成后读尾输出、stop 进程树、CLI/runtime crash 和非 UTF-8 边界。
- **状态**：`Specified`。

### CAP-014 编码工具套件

- **来源**：`Kodex-current`。
- **Node 设计落点**：Local Tool Gateway 提供 patch、文件读取/搜索、image view 和 workspace-aware 操作；远程 web/MCP 与本机工具分开；plan 是 runtime 耐久状态。
- **OpenSpec requirement**：`Assistant coding tool suite` SHALL 完整映射固定 baseline 中已接线的工具，并逐工具定义 input/output schema、执行位置、路径/符号链接边界、审批策略、大结果/artifact 和失败/结果未知语义；缺少 Node 映射不是可接受的排除理由。
- **实现证据**：待提供每个 tool contract、CLI executor、runtime adapter、tool catalog/search 及 harness 实际暴露证据。
- **验收证据**：用临时 workspace 验证成功/失败/approval、path traversal/symlink escape、patch 冲突、图片与大结果。
- **状态**：`Specified`。

### CAP-015 HITL

- **来源**：`Kodex-current`。
- **Node 设计落点**：PG `AssistantInterrupt` + durable checkpoint；`request_user_input` 和 host-owned 交互由 Ink 回答，Runtime 用绑定 interrupt ID 的 resume command 恢复，不伪执行为 MCP tool。
- **OpenSpec requirement**：`Durable human interrupts` SHALL 定义 payload/answer schema、secret 显示、resolve/reject/cancel、重复回答、结果未知、CLI 离线和 checkpoint 绑定。
- **实现证据**：待提供 interrupt schema/service/API、LangGraph adapter 和 Ink child interaction 实际接线。
- **验收证据**：不同问题类型、秘密答案、拒绝、重复提交、断网后重连、runtime 重启和 stop 竞争。
- **状态**：`Specified`。

### CAP-016 subagent

- **来源**：`Node-enhancement`；用户批准不实现 Kodex Suggested Sessions，仅保留真正的 Deep Agents SubAgent。
- **Node 设计落点**：Deep Agents child Run 建立 parent/child lineage、独立上下文、预算、结果回流和权限收窄；不得以创建独立 Session 冒充。
- **OpenSpec requirement**：`Runtime subagents` SHALL 定义 child Run 生命周期、并发/预算、取消、恢复、结果投影；child 只能继承或收窄 owner/workspace/tools/memory/budget，不得扩权。`Suggested Sessions exclusion` SHALL 明确其不进入运行目录。
- **实现证据**：待提供 child-run orchestrator、lineage/result projection、权限与预算 enforcement；不建立 suggested-session batch API。
- **验收证据**：真 subagent 的并发、预算、回流、取消、崩溃恢复和不扩权，并验证运行目录中不存在 Suggested Sessions 流程。
- **状态**：`Specified`。

### CAP-017 pending / crash recovery

- **来源**：`Kodex-current` 耐久 pending 语义的 Node 生产化。
- **Node 设计落点**：PG durable checkpoint + structured Run/Event/ToolExecution/Interrupt；恢复时核对已提交副作用、pending 和 checkpoint version，Redis 清空不影响恢复。
- **OpenSpec requirement**：`Crash-safe run recovery` SHALL 定义 model/tool/HITL/compact 每个提交点、checkpoint 与事件一致性、幂等键、unknown 状态、自动/人工恢复策略。
- **实现证据**：待提供 PG checkpointer、事务/outbox/reconciler、recovery worker 及各副作用 adapter 的 idempotency 接线。
- **验收证据**：在模型流、工具执行前/后、结果提交前/后、HITL、compact 中注入崩溃，验证不伪完成且不重放非幂等副作用。
- **状态**：`Specified`。

### CAP-018 compact

- **来源**：`Kodex-current`。
- **Node 设计落点**：Deep Agents summarization 只提供算法；产品使用 PG compact point + original events，支持自动/强制 compact、Compacting 状态、model-aware budget 和失败恢复。
- **OpenSpec requirement**：`Auditable context compaction` SHALL 定义触发阈值、覆盖 sequence、保留项、tool call/result 配对、pending 排除、token reset、换模型重算和原历史/fork 可见性。
- **实现证据**：待提供 compact schema/service、summarization adapter、budget resolver、checkpoint/event transaction 和手动命令接线。
- **验收证据**：自动/强制、tool/pending 边界、换模型、中途崩溃、摘要失败和 compact 后继续/fork 的 E2E。
- **状态**：`Specified`。

### CAP-019 fork / revert

- **来源**：`Kodex-current`。
- **Node 设计落点**：Fork 事务复制稳定 PG 前缀、settings/context/compact/checkpoint 为独立 Session，lineage 仅用于审计；user Mem0 共享，session Mem0 复制后独立；artifact 引用复制且 blob 引用计数回收。Revert/Revert and edit 用 CAS 移动活动头并保留审计分支。
- **OpenSpec requirement**：`Session fork at stable history point` 与 `Revert and edit` SHALL 定义边界包含性、独立存储、源删除隔离、Mem0/artifact 行为、并发源写入、活动头 CAS、编辑后新 Run 和未知回执。
- **实现证据**：待提供 fork command/service、lineage schema、snapshot query/transaction 和 CLI history action。
- **验收证据**：完整 fork、历史点 fork、compact 前后、pending tool/HITL 边界、并发 append 和丢回执不盲目重放。
- **状态**：`Specified`。

### CAP-020 settings CAS

- **来源**：`Kodex-current`。
- **Node 设计落点**：PG `AssistantSettingsVersion` 使用 revision/fencing 的 compare-and-set；Session 设置、新 Session defaults 和全局配置分开，字段冲突可见。
- **OpenSpec requirement**：`Versioned assistant settings` SHALL 定义 expect/update/revision、同值、真冲突、保留无关字段重试、丢回执不盲目重放和 Run 开始时快照。
- **实现证据**：待提供 settings schema/repository/CAS service、contract 和 Ink conflict UI。
- **验收证据**：并发修改同/不同字段、自动标题竞争、丢回执、迟到投影和已运行 Run 不被无意改写。
- **状态**：`Specified`。

### CAP-021 AGENTS / Skills

- **来源**：`Kodex-current`。
- **Node 设计落点**：CLI 在授权 workspace 解析 AGENTS 层级、skills catalog 和显式 skill 正文，上传带 hash/source/binding 的 context snapshot；Runtime 组装临时 prefix，按 Turn 耐久化显式 skill 输入。
- **OpenSpec requirement**：`Workspace context snapshots` SHALL 定义来源优先级、同名覆盖、大小预算、每次请求刷新、snapshot 完整性、路径脱敏、prompt injection 边界、resume/fork 使用当时正文。
- **实现证据**：待提供 CLI resolver/hasher/uploader、runtime validator/prefix adapter、snapshot persistence 和 skill selection UI。
- **验收证据**：多层 AGENTS、同名 skill、文件运行中变更、超限/越界/symlink、crash resume 和 fork 不被未来文件篡改。
- **状态**：`Specified`。

### CAP-022 Redis / PostgreSQL 短期与耐久状态

- **来源**：`Node-enhancement`（Node 替代实现）。
- **Node 设计落点**：PG 是 Session/Event/Run/Tool/Interrupt/checkpoint/settings/compact/audit 真源；Redis 只存窗口、摘要热副本、lease/fencing、限流、Pub/Sub 和可重建缓存。
- **OpenSpec requirement**：`Durable and hot-state boundary` SHALL 定义每种数据的 owner/TTL/rebuild、PG 提交与 Redis 投影顺序、outbox/reconciliation、Redis miss/flush 和禁止的唯一真源用法。
- **实现证据**：已有 Runtime `.env.example`、启动环境校验、配置文档和 Turbo 环境透传，明确 PG schema/pool/SSL 与 Redis URL/prefix/hot TTL/lease TTL/command timeout；这只是配置前置。仍待 migrations/repositories、真实 PG/Redis adapters、key catalog、projectors/outbox/rebuilder 和依赖断开时的运行策略。
- **验收证据**：Redis flush/restart/unavailable，PG 成功后 Redis 失败，热投影重建，且 pending HITL/tool/history/settings 不丢失。
- **状态**：`Specified`。

### CAP-023 Mem0 长期记忆

- **来源**：`Node-enhancement`。
- **Node 设计落点**：Mem0 仅保存可复用偏好、稳定项目约定、用户明确要求记住的内容和过滤后的长期事实；召回只作为本次 invoke 临时 context。API key/token/password/cookie/OAuth/MCP/model secret、原始对话、完整源码/patch/shell 输出和未处理 tool result 禁止写入。
- **OpenSpec requirement**：`Scoped extracted memory` SHALL 定义召回/预算、准入与禁止内容、source/scope/time、幂等写、CLI 检查/纠错/删除、Fork 复制、所有权和失败补偿。
- **实现证据**：已有 `platform`/`self_hosted` 条件环境校验、Agent scope/top-K/timeout/extraction switch 配置与边界文档；未定义 `userId`/`runId` 为正式环境键。仍待 Mem0 adapter、owner/Session scope 注入、retrieval composer、post-turn extractor、idempotency/outbox 和 privacy APIs；不以 Mem0 代替 PG 聊天/checkpoint。
- **验收证据**：跨 Session 偏好、Session 隔离、无信息增量不写、不重复注入/摘要、Mem0 不可用时对话仍完成并可幂等补偿。
- **状态**：`Specified`。

### CAP-024 Hook

- **来源**：`Mixed`：固定 Kodex baseline 的当前 RPC 生产路径注入 `NoOpKodexHooks`，因此控制型 Hook 不是 `Kodex-current`；Node 方案明确主动采纳为增强。
- **Node 设计落点**：Runtime 实现 owner-scoped、按 Run 快照的 `PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`Stop`、`PreCompact`、`PostCompact`、`UnhandledError` 七类 Hook；workspace 命令经准确 Local Tool Gateway binding 执行，使用类型化脱敏上下文、有限超时、顺序、取消与耐久结果。
- **OpenSpec requirement**：`Configured lifecycle Hooks` SHALL 固定 NoOp baseline 分类，并定义七类 Node Hook 的配置快照、执行位置、顺序、控制输出、通知行为、fail policy、超时、取消、历史写入与权限不扩张语义。
- **实现证据**：待提供 Hook contract/config snapshot、manager/executor、Gateway adapter、Run/Tool/Compact/Error 接线和审计事件；baseline NoOp 不构成 Node 已实现证据。
- **验收证据**：覆盖顺序 block、timeout fail policy、Run 取消、UnhandledError 失败不覆盖原错误、配置变更只影响后续 Run，以及七类 Hook 的逐类行为。
- **状态**：`Specified`。

### CAP-025 artifacts / images

- **来源**：`Kodex-current`。
- **Node 设计落点**：PG `AssistantArtifact` 保存 owner、MIME、size/hash、storage reference、producer Run/Tool；blob 进受控对象存储，SSE/event 只携带引用。Fork 复制引用，immutable blob 在最后引用删除后才回收。
- **OpenSpec requirement**：`Owned assistant artifacts` SHALL 定义上传/生成/读取、类型/大小/hash、所有权、保留/删除、带签名访问和 terminal fallback rendering。
- **实现证据**：待提供 artifact schema/repository/storage adapter/API、event references 和 Ink renderers。
- **验收证据**：图片、patch、大 stdout 、非支持 MIME、跨用户访问、存储失败、Session 删除与孤儿清理。
- **状态**：`Specified`。

### CAP-026 Ink Session / History UI

- **来源**：`Kodex-current`（Mosaic 能力的 Ink 重建）。
- **Node 设计落点**：`apps/assistant-cli` Ink renderer 消费 runtime contract；完整保留 History/Terminal sidebars，提供 Session tree/catalog、tabs、创建/打开/归档/删除/fork/revert、有界历史、stream/durable merge 和状态区分；纯布局偏好仅存本机。
- **OpenSpec requirement**：`Ink session and history console` SHALL 定义导航/焦点/键盘鼠标/窄终端/resize、历史分页、迟到 replay 合并和 text/reasoning/tool/plan/compact/HITL/subagent 的可区分渲染。
- **实现证据**：当前 CLI 是命令行 ping/stream stub，不是 Ink UI；待 component/view-model/store/render tree 和 runtime API 接线。
- **验收证据**：Ink 组件测试 + PTY 端到端，覆盖大历史、断线 replay、多 tab、状态渲染、resize 和重启恢复。
- **状态**：`Specified`。

### CAP-027 Ink composer / settings / path / patch / tool UI

- **来源**：`Kodex-current`。
- **Node 设计落点**：Ink child components 分别持有 composer draft、active-run steer/stop、完整 AskUser 暂停/回答/恢复、用户自有模型连接与参数、MCP/Session settings、workspace/path picker、patch/image/artifact、long-process stdin 交互；不在 CLI 复制后端真源。
- **OpenSpec requirement**：`Ink assistant interaction surfaces` SHALL 定义每个 child state/effect/command、精确 handle 绑定、取消/关闭、settings 冲突、path capability、approval 与密钥显示。
- **实现证据**：待提供 Ink component boundaries、tests、API clients 和真实 runtime/Gateway 接线。
- **验收证据**：composer 在 idle/running 的 submit/steer，stop，CAS 冲突，path 越界，patch 大小/颜色 fallback，HITL 与长进程 stdin。
- **状态**：`Specified`。

### CAP-028 usage

- **来源**：`Kodex-current`。
- **Node 设计落点**：Provider adapters 将 input/output/cache/reasoning/token/cost/rate-limit 与缺失诊断归一为 durable usage events；用于展示、预算和审计，不伪造 provider 未报告的精确值。
- **OpenSpec requirement**：`Provider usage projection` SHALL 定义指标、缺失/零值、attempt 归属、continuation/retry/compact 计费、聚合及不支持 provider 的 UI 语义。
- **实现证据**：待提供 usage contract/schema、provider mappings、aggregator/API 和 Ink display。
- **验收证据**：有/无 usage provider、streamed final usage、retry/continue、compact reset 与 Session/Run/Turn 聚合一致性。
- **状态**：`Specified`。

### CAP-029 observability / audit

- **来源**：`Node-enhancement`。
- **Node 设计落点**：结构化 logs/metrics/traces 使用 user/session/run/turn/tool/attempt correlation；安全审计单独记录登录、授权失败、危险工具、设置、密钥和删除操作，并默认脱敏。
- **OpenSpec requirement**：`Assistant observability and audit` SHALL 定义 correlation IDs、指标/SLO、trace 边界、审计事件、数据分类/脱敏/保留、管理访问和告警。
- **实现证据**：待提供 logger/tracer/metrics/audit sink、redaction tests、dashboard/alert 配置及生产入口接线。
- **验收证据**：一次完整 Run 可跨服务追踪，故障告警可见，prompt/tool secret 不进日志，审计不可由普通用户篡改。
- **状态**：`Specified`。

### CAP-030 multi-replica / lease / fencing / idempotency

- **来源**：`Node-enhancement`。
- **Node 设计落点**：Redis lease 只做协调，PG 保存单调 fencing epoch/command idempotency/outbox；失去租约的旧 runtime 不能继续提交 Run/event/tool result。
- **OpenSpec requirement**：`Single-writer run ownership` SHALL 定义 lease acquire/renew/expiry、fencing token 提交校验、command/result idempotency、leader 转移、clock 假设和 Redis/PG 部分失败。
- **实现证据**：待提供 lease manager、PG fencing columns/constraints、idempotency store/outbox 和所有 mutation 的 owner check。
- **验收证据**：两 replica 竞争、租约过期后旧 owner 迟到提交、Redis 分区/清空、PG 短断和重复 command/result。
- **状态**：`Specified`。

### CAP-031 deletion / privacy / secrets

- **来源**：`Node-enhancement`。
- **Node 设计落点**：provider/MCP/OAuth secret 加密且仅存 reference；prompt/tool args/output/trace 限长脱敏；Archive 可恢复，Delete 不可逆。Session/user 删除协调 PG、checkpoint、artifact 引用、Redis 投影和 Mem0，报告部分失败，且不得损坏独立 Fork。
- **OpenSpec requirement**：`Assistant data protection lifecycle` SHALL 定义 secret encryption/rotation/access、data classification/retention、export/correction/deletion、Mem0 来源删除、artifact 清理和可补偿的部分成功。
- **实现证据**：待提供 key management/secret store、redaction library、deletion orchestrator/tombstone/reconciler 和权限/审计接线。
- **验收证据**：密钥轮换、日志/事件脱敏、Session/user 删除、Mem0/artifact 部分失败后补偿、已删除数据不被热缓存复活。
- **状态**：`Specified`。

### CAP-032 scaffold / release / acceptance

- **来源**：`Node-enhancement`（交付门禁）。
- **Node 设计落点**：Turborepo 中的 `assistant-runtime-service`、`assistant-cli`、`UserPlatform`、contracts、migrations、可重现本地/生产配置、发布产物、升级/回滚和端到端验收套件。
- **OpenSpec requirement**：`Assistant production delivery` SHALL 定义安装/配置/迁移、依赖健康、发布签名/版本协议、兼容性、回滚、验收环境和全部 `CAP-*` release gate。
- **实现证据**：当前已有 Nest ping/echo SSE、CLI ping/stream 命令和 ping contract 脚手架；它们只证明工作区、编译与基础 HTTP/SSE 连通性，**不证明 CAP-001～CAP-031 已实现**。
- **验收证据**：全新环境部署、schema 升级/回滚、CLI/runtime 版本不匹配、依赖故障、全功能矩阵、故障注入、安全负向及人工 TUI 验收回执。
- **状态**：`Specified`。

## 4. OpenSpec 追溯规则

1. 每个 OpenSpec change 的 proposal/design/tasks/spec requirements 必须列出所覆盖的 `CAP-*`；一个 change 可覆盖多项，一项也可拆成多个 change。
2. 每个 `CAP-*` 至少有一个正向 scenario、一个失败/取消 scenario；涉及并发、副作用或断线的项必须有重复/竞争/崩溃 scenario。
3. 架构、数据库、协议、安全或部署边界的最终决策同步更新 `docs/architecture/README.md` 并新增/替代 ADR；proposal、OpenSpec 和 ADR 不互相替代。
4. `Specified` 之前运行项目当前规定的 strict validation，把命令与结果写入验收证据。
5. tasks 必须反向链接 requirement/scenario 和 `CAP-*`；“创建 service/interface”不是单独的功能完成条件。

### 4.1 CAP → requirement/scenario → task 精确追溯

以下路径均相对于仓库根目录；表内路径前缀 `...` 严格展开为 `openspec/changes/implement-node-assistant-runtime`，`tasks.md` 严格指该前缀下的同名文件。`Specified` 只表示规格门槛成立，不表示 task 已执行或生产功能已接线。

| CAP     | OpenSpec requirement 与 scenario 证据                                                                                                                                                                                                                                                                                                                                                            | 主要 task 证据                                 | 审计结论    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ----------- |
| CAP-001 | `.../specs/assistant-access-control/spec.md` → Assistant admission、Service token boundary、Token revocation 的全部 scenarios；精确原子映射见 `acceptance/scenario-trace.yaml`                                                                                                                                                                                                                   | `tasks.md` 3.2、5.1～5.4、14.1、16.2           | `Specified` |
| CAP-002 | `.../specs/assistant-access-control/spec.md` → Per-resource ownership、CLI/workspace binding、User-owned model connection 的全部 scenarios；模型 suite 为显式 CAP-002/CAP-010 多 CAP owner                                                                                                                                                                                                       | `tasks.md` 4.4、5.5、9.2、12.1～12.5、16.6     | `Specified` |
| CAP-003 | `.../specs/assistant-session-runtime/spec.md` → `CAP-003 Session lifecycle` / `Automatic title races with user rename`                                                                                                                                                                                                                                                                           | `tasks.md` 6.1～6.2、14.3、16.2                | `Specified` |
| CAP-004 | `.../specs/assistant-session-runtime/spec.md` → `CAP-004 Backend-owned Run` / `Stream subscriber disconnects`, `Concurrent Run is requested`, `Local tool result resumes the matching wait`, `Wrong actor attempts to resume a wait`, `Stop races with successful completion`, `Terminal Run receives another transition`；requirement 正文枚举完整 Run 状态、合法转换、Waiting 恢复者与终态 CAS | `tasks.md` 3.3、7.1～7.2、7.6～7.7             | `Specified` |
| CAP-005 | `.../specs/assistant-event-stream/spec.md` → `CAP-005 Ordered durable events` / `Parallel tools complete out of order`; `CAP-005 Bounded history queries` / `Client pages older history`                                                                                                                                                                                                         | `tasks.md` 3.4、4.5、8.4                       | `Specified` |
| CAP-006 | `.../specs/assistant-event-stream/spec.md` → `CAP-006 Replayable SSE` / `Client reconnects after losing events`; `CAP-006 Slow consumer handling` / `Subscriber exceeds buffer allowance`                                                                                                                                                                                                        | `tasks.md` 3.4、8.5～8.7、14.2                 | `Specified` |
| CAP-007 | `.../specs/assistant-session-runtime/spec.md` → `CAP-007 Continue and retry separation` / `Provider requests normal continuation`, `Retry budget is exhausted`                                                                                                                                                                                                                                   | `tasks.md` 3.3、7.3、9.4                       | `Specified` |
| CAP-008 | `.../specs/assistant-session-runtime/spec.md` → `CAP-008 Durable steer` / `Two steer commands arrive during a tool call`                                                                                                                                                                                                                                                                         | `tasks.md` 3.3、7.4、14.5                      | `Specified` |
| CAP-009 | `.../specs/assistant-session-runtime/spec.md` → `CAP-009 Explicit stop` / `User stops a Run with a local process`                                                                                                                                                                                                                                                                                | `tasks.md` 3.3、7.5～7.6、12.7、14.5           | `Specified` |
| CAP-010 | `.../specs/assistant-model-context-memory/spec.md` → `CAP-010 Model capability catalog` / `Selected model lacks required tool calling`; model connection ownership scenarios归 CAP-002 并由多 CAP model suite 联合验收                                                                                                                                                                           | `tasks.md` 3.5、9.2～9.4、10.3                 | `Specified` |
| CAP-011 | `.../specs/assistant-tools-and-collaboration/spec.md` → `CAP-011 Remote MCP lifecycle` / `MCP catalog changes during a Run`; access-control SSRF scenarios                                                                                                                                                                                                                                       | `tasks.md` 3.6、11.1～11.4                     | `Specified` |
| CAP-012 | `.../specs/assistant-tools-and-collaboration/spec.md` → `CAP-012 Local tool dispatch` / `CLI disconnects before acknowledging request`; `CAP-012 Local path confinement` / `Patch targets a symlink outside workspace`; `CAP-012 Local approval policy` scenarios                                                                                                                                | `tasks.md` 3.6、12.1～12.5、12.8、16.6         | `Specified` |
| CAP-013 | `.../specs/assistant-tools-and-collaboration/spec.md` → `CAP-013 Interactive process sessions` / `Process outlives initial command response`, `Run is stopped`                                                                                                                                                                                                                                   | `tasks.md` 3.6、12.6～12.7                     | `Specified` |
| CAP-014 | `.../specs/assistant-tools-and-collaboration/spec.md` → `CAP-014 Coding tool coverage` / `Patch succeeds inside the bound workspace`, `Patch target changed before execution`, `Tool side effect has an unknown result`, `Capability has no implementation mapping`；requirement 禁止用实现偏好或缺少 Node mapping 排除已接线 baseline 工具                                                      | `tasks.md` 12.8～12.9、16.3                    | `Specified` |
| CAP-015 | `.../specs/assistant-tools-and-collaboration/spec.md` → `CAP-015 Durable HITL` / `Same answer is submitted twice`; `CAP-015 HITL rejection` / `User rejects dangerous operation`                                                                                                                                                                                                                 | `tasks.md` 3.6、13.1～13.3                     | `Specified` |
| CAP-016 | `.../specs/assistant-tools-and-collaboration/spec.md` → `CAP-016 Subagent isolation` / `Subagent requests broader workspace access`, `Child Run completes`, `Suggested Session workflow is absent from the approved target`                                                                                                                                                                      | `tasks.md` 3.6、13.4～13.6                     | `Specified` |
| CAP-017 | `.../specs/assistant-session-runtime/spec.md` → `CAP-017 Durable pending recovery` / `Redis is cleared during human input wait`                                                                                                                                                                                                                                                                  | `tasks.md` 4.5、9.5～9.8、16.4                 | `Specified` |
| CAP-018 | `.../specs/assistant-session-runtime/spec.md` → `CAP-018 Context compaction` / `Forced compaction succeeds`, `Compaction is interrupted`                                                                                                                                                                                                                                                         | `tasks.md` 3.3、10.4、16.5                     | `Specified` |
| CAP-019 | `.../specs/assistant-session-runtime/spec.md` → `CAP-019 Fork at an exact event` / `Fork before a pending tool`, `Source Session is deleted after fork`; `CAP-019 Revert and edit` scenarios                                                                                                                                                                                                     | `tasks.md` 3.3、6.4、6.8、16.5                 | `Specified` |
| CAP-020 | `.../specs/assistant-session-runtime/spec.md` → `CAP-020 Versioned settings CAS` / `Unrelated setting changed concurrently`                                                                                                                                                                                                                                                                      | `tasks.md` 3.3、6.3、14.6、16.5                | `Specified` |
| CAP-021 | `.../specs/assistant-model-context-memory/spec.md` → `CAP-021 Workspace context snapshot` / `Explicit Skill changes after Run acceptance`, `Context path escapes workspace`                                                                                                                                                                                                                      | `tasks.md` 3.5、10.1～10.3、16.6               | `Specified` |
| CAP-022 | `.../specs/assistant-model-context-memory/spec.md` → `CAP-022 Durable and hot state separation` / `Redis working set is missing`                                                                                                                                                                                                                                                                 | `tasks.md` 4.5、8.1～8.3、8.7、16.4            | `Specified` |
| CAP-023 | `.../specs/assistant-model-context-memory/spec.md` → Scoped Mem0 recall、Managed Mem0 boundary、Memory extraction lifecycle 的全部 scenarios                                                                                                                                                                                                                                                     | `tasks.md` 3.5、10.5～10.6、16.4               | `Specified` |
| CAP-024 | `.../specs/assistant-model-context-memory/spec.md` → `CAP-024 Configured lifecycle Hooks` / `PreToolUse blocks a local command`, `Hook times out`, `Run is cancelled during a Hook`, `UnhandledError notification Hook fails`, `Hook configuration changes during a Run`；requirement 明确 baseline 为 NoOp，并采纳七类 Node Hook                                                                | `tasks.md` 3.5、10.7、16.5                     | `Specified` |
| CAP-025 | `.../specs/assistant-event-stream/spec.md` → `CAP-025 Owned artifacts` / `Generated image is committed`, `Artifact persistence fails`                                                                                                                                                                                                                                                            | `tasks.md` 3.7、11.5～11.6、16.3、16.6         | `Specified` |
| CAP-026 | `.../specs/assistant-cli/spec.md` → `CAP-026 Session navigation` / `Selected Session is archived remotely`; `CAP-026 Bounded history UI` / `Live item becomes durable`                                                                                                                                                                                                                           | `tasks.md` 14.2～14.4、14.8～14.9、16.8        | `Specified` |
| CAP-027 | `.../specs/assistant-cli/spec.md` → Composer、workspace/settings、完整 sidebars/local preferences、tool/artifact、terminal quality 的全部 scenarios                                                                                                                                                                                                                                              | `tasks.md` 14.5～14.9、16.8                    | `Specified` |
| CAP-028 | `.../specs/assistant-model-context-memory/spec.md` → Usage reporting 的缺失数据、provider balance/reset 与 no-billing scenarios                                                                                                                                                                                                                                                                  | `tasks.md` 3.5、9.4、10.8、16.5                | `Specified` |
| CAP-029 | `.../specs/assistant-observability-delivery/spec.md` → `CAP-029 Correlated observability` / `Tool execution fails across services`; `CAP-029 Durable audit` / `Stale replica attempts commit`                                                                                                                                                                                                    | `tasks.md` 3.7、15.1～15.5、16.6               | `Specified` |
| CAP-030 | `.../specs/assistant-session-runtime/spec.md` → `CAP-030 Multi-replica fencing` / `Expired owner submits late output`                                                                                                                                                                                                                                                                            | `tasks.md` 3.3、8.2、9.7、16.4                 | `Specified` |
| CAP-031 | `.../specs/assistant-access-control/spec.md` → Minimum public-exposure gate、Secret protection、Deletion and retention 的全部 scenarios                                                                                                                                                                                                                                                          | `tasks.md` 3.7、5.6～5.7、6.5～6.7、15.2、16.6 | `Specified` |
| CAP-032 | `.../specs/assistant-observability-delivery/spec.md` → capability ledger、independent audit、migration/rollback 与 approved-target acceptance 的全部 scenarios；精确映射以 `acceptance/scenario-trace.yaml` 为唯一机器真源                                                                                                                                                                       | `tasks.md` 1.1～1.5、16.1～16.11、17.1～17.5   | `Specified` |

### 4.2 2026-10-05 首次独立 Capability Auditor 规格审计（历史记录）

- **审计范围**：`proposal.md`、`design.md`、`tasks.md` 和 `specs/*/spec.md` 七份 delta spec；未审计生产实现，未执行任何 Apply task。
- **验证回执**：在仓库根运行 `openspec validate implement-node-assistant-runtime --type change --strict --json`，结果 `valid: true`、`issues: []`、1/1 passed。
- **覆盖结论**：CAP-001～CAP-032 均至少出现一个带 SHALL 的 requirement 和一个 scenario；proposal 的七个 capability 分组覆盖全部 32 个 ID，tasks 也覆盖全部 32 个 ID。
- **当时的晋级结论**：27 项具有与台账目标一致、可测试的 requirement/scenario，晋级为 `Specified`；CAP-004、CAP-014、CAP-016、CAP-024、CAP-032 当时因下列语义缺口保留 `Proposed`。当前状态以后续 4.3 二次审计为准；两个阶段均没有任何项目晋级为 `Implemented` 或 `Verified`。
- **实现边界**：全部 implementation task 仍是未勾选状态；当前 ping/echo SSE 与命令行 client 继续只算 scaffold。

#### 首次审计问题（已由 4.3 二次审计确认修复）

1. **CAP-004**：首次审计发现完整状态机只在 design/tasks；现已进入 requirement 正文和恢复/竞争/终态 scenarios。
2. **CAP-014**：首次审计发现普通 approved-exclusion 会弱化完全实现；现已禁止用实现偏好或缺少 Node mapping 排除已接线 baseline 工具，并补正反 scenarios。
3. **CAP-016**：首次审计曾把 suggested-session 视为缺口；该中间结论已被后续用户决策取代。当前规格只实现真正 child Run SubAgent，并把 Suggested Sessions 记录为批准排除。
4. **CAP-024**：首次审计发现 Hook 采纳范围未决；现已固定 baseline NoOp 事实，并明确 Node 增强采纳七类 Hook 及其行为。
5. **CAP-032**：首次审计发现 compile-only 晋级冲突；现已修正为保持 `Specified`。

#### 非阻塞但需在相应实现切片前收紧

- CAP-006 的 slow-consumer bound、CAP-007 的 retry policy、CAP-025 的 artifact limits 等参数可由配置决定，但 OpenSpec 或 ADR 必须给出所有者、默认值和可验证边界，避免实现自行选择互不兼容的语义。CAP-001 的撤销边界已固定为五分钟 token 到期。
- CAP-011 的 requirement 很宽，而 OAuth、失效刷新、reconnect、catalog retention 的主要行为只在 tasks 中；进入 MCP 实现切片前应补关键失败 scenarios。
- CAP-012 对“CLI 已执行但结果未提交”的 unknown-result 行为主要存在于 design/tasks；进入 Gateway 实现前应提升为 delta spec scenario。
- CAP-021 已覆盖 snapshot 与路径逃逸，但 source precedence、同名 Skill 覆盖和大小预算目前主要在 tasks；实现前应固化测试语义。
- CAP-029 的健康/ready、限流与指标基数主要由 tasks 承担；它们是生产验收项，不能因核心 trace/audit requirement 已 `Specified` 而遗漏。

### 4.3 2026-10-05 二次独立 Capability Auditor 修复审计

- **审计对象**：仅复核 CAP-004、CAP-014、CAP-016、CAP-024、CAP-032 的修订 delta specs，并核对它们与主方案、首次审计问题和 tasks 的映射。
- **严格验证回执**：重新运行 `openspec validate implement-node-assistant-runtime --type change --strict --json`，结果 `valid: true`、`issues: []`、1/1 passed。
- **CAP-004**：`assistant-session-runtime/spec.md` 已枚举 11 个 Run 状态、4 个 terminal 状态、合法转换、每类 Waiting 的唯一 durable resume authority、恢复规则和终态 CAS；新增匹配恢复、错误 actor、stop/completion 竞争与 terminal 不可逆 scenarios。证据充分，晋级 `Specified`。
- **CAP-014**：`assistant-tools-and-collaboration/spec.md` 已要求完整实现批准目标中的全部固定 baseline 工具；新增 patch 成功、乐观冲突、非幂等结果未知和缺映射阻断目标完成 scenarios。证据充分，晋级 `Specified`。
- **CAP-016**：该次审计曾新增 Suggested Sessions；此历史结论后来被用户明确推翻。当前 spec 仅保留真正 child Run SubAgent，并将 Suggested Sessions 作为批准排除；须以最新独立审查结果为准。
- **CAP-024**：`assistant-model-context-memory/spec.md` 已明确固定 Kodex baseline 在当前 RPC 生产路径注入 NoOp，并将七类 configured Hook 作为 Node enhancement 主动采纳；顺序、Run 快照、Local Tool Gateway、控制输出、超时、取消、通知错误与权限边界均有 SHALL/scenario。证据充分，晋级 `Specified`。
- **CAP-032**：`assistant-observability-delivery/spec.md` 的 compile-only scenario 已改为保持 `Specified`，与本台账晋级门槛一致。证据充分，晋级 `Specified`。
- **最终规格状态**：CAP-001～CAP-032 现均为 `Specified`；仍无任何 `Implemented` 或 `Verified`。上述晋级只证明规格完整性，不证明 implementation tasks、生产接线或运行验收已完成。
- **baseline 回执**：同期再次运行 `git -C /Users/temptrip/Desktop/Project/Kodex rev-parse HEAD` 得到 `3008a6de9f178cda7cd63123a0261d75013f772d`，`git status --short` 无输出，branch 为 `main`；据此已将 1.1 从候选升格为已固定源码 baseline。

## 5. 编码会话的 subagent 审计流程

用户要求的 subagent 是**独立验收角色**，不是实现者的自评。每个实施会话必须执行下列流程。

### 5.1 会话开始

1. 主 agent 读取根 `AGENTS.md`、主方案、本台账、当前 OpenSpec change 和影响范围的项目 rules/skills。
2. 主 agent 创建一个命名的“Capability Auditor” subagent，将本会话的目标 `CAP-*`、OpenSpec requirements/scenarios、baseline commit 和允许改动范围交给它。
3. Auditor 在编码前回传一份简短的“验收合同”：目标功能、非目标、必须产生的实现证据、自动化测试、E2E/故障注入和人工验收。
4. 主 agent 只在验收合同与经验证的 OpenSpec 一致时开始 Apply；Auditor 不代替用户对 Apply、破坏性迁移或发布的授权。

### 5.2 编码进行中

- Auditor 可读取 diff、测试和回执，但默认不改生产代码，避免同一个 agent 同时成为实现者与唯一验收者。
- 若实现改变能力边界，先修改并重验 OpenSpec，再同步本台账；不允许用代码事实偷偷改 spec。
- 实现者按 `CAP-*` 保留证据地址，不将一个绿色总命令代替逐项证据。

### 5.3 会话结束验收

1. Auditor 先确定 diff 和实际生产接线，再核对 OpenSpec scenario；不仅信任 task checkbox 或实现者摘要。
2. Auditor 为每个目标 `CAP-*` 输出：建议状态、OpenSpec 路径、实现路径、执行的测试/环境/结果、未验证边界、baseline 差异和 blocker。
3. 只有生产路径与自动化证据都成立才可建议 `Implemented`；只有本台账要求的 E2E/故障注入/人工交互都完成才可建议 `Verified`。
4. 主 agent 根据可复查证据更新台账；对未能实际执行的验收明确保留边界，不推测通过。
5. 会话最终报告按“已实现、已验证、未验证、baseline/已知失败、未提交/未发布”分开陈述。

### 5.4 台账更新约束

- 保留已有 `CAP-*` ID；拆分时用 requirement/task ID 表达，不另建同义 CAP。
- 证据应指向精确文件/测试/回执，并标记 commit 或工作树状态；旧证据被替代时保留历史说明。
- 新增实现不能把 `Kodex-unwired` 改写成 `Kodex-current`；那是 baseline 核验结论，不是 Node 实施状态。
- 脚手架、mock、no-op、固定响应、仅类型检查或仅静态 config 只能作为前置证据，不得把功能状态推到 `Implemented`。

## 6. 当前证据快照

### 6.0 Apply 入口清单（任务 2.1）

- 基线为 `896e79cc784c53b46e75ed87dbfc040b998feeb8`，工作树在本 change 开始前已包含未提交的 Assistant 规划、ADR、contracts、Runtime/CLI scaffold、根配置和文档改动。
- `assistant-runtime-service` 是 CommonJS Nest scaffold，只有配置校验、健康检查、ping 与固定 echo SSE；`assistant-cli` 只有命令解析、ping 和原始 SSE 消费；二者均不是已实现的产品能力。
- workspace 使用 pnpm 11 + `apps/*`/`packages/*`，根 Turbo 已定义 `build`、`lint`、`check-types`、`dev`；Nest app 复用 `@repo/typescript-config` 与 `@repo/eslint-config`。
- 本轮新增范围从 `apps/user-platform-service/` 开始；上述既有 dirty worktree 全部按用户已有工作保留，不据此重新归属或扩大完成结论。

| 范围                        | 当前可确认                                                                                                                                                                            | 明确不能宣称                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `assistant-runtime-service` | Nest app/module、health/ping、固定 echo SSE scaffold；PG/Redis/Mem0 条件化环境 schema、启动校验、示例与运维文档                                                                       | 真实 PG/Redis/Mem0 adapters 或任何读写/恢复行为；模型/Deep Agents、耐久事件、replay、状态机、工具、认证授权         |
| `assistant-cli`             | Node CLI 命令解析、ping、读原始 SSE body                                                                                                                                              | Ink、Session/history、HITL、Local Tool Gateway、workspace context、stop/steer/settings                              |
| `@repo/contracts`           | ping contract；协议 generation 1、ID/timestamp/version/sequence、command metadata、resource reference、history cursor、retry/error envelope、command-accepted Zod primitives 及根导出 | UserPlatform、Session/Run/Turn/Event/SSE/Tool/Interrupt/Auth/Artifact/Settings 等完整产品契约；任何耐久或服务端行为 |
| 架构决策                    | ADR-0018/0019/0020 已接受三部署边界、PG/Redis/Mem0 职责、Deep Agents adapter、Local Tool Gateway 与 Ink 方向                                                                          | ADR 接受不等于模块、数据库、协议端点、Gateway、Agent harness 或 Ink 已实现                                          |
| 整体                        | 基础 monorepo/HTTP/SSE 脚手架、完整 OpenSpec 与第一批协议基础存在于当前未提交 worktree                                                                                                | 任何 `CAP-001`～`CAP-032` 已实现或已验收                                                                            |

### 6.1 2026-10-05 编码会话结束验收：ADR 与协议基础切片

#### 审计对象与实际实现证据

- **架构决策**：
  - `docs/architecture/decisions/0018-separate-user-platform-assistant-runtime-and-cli.md` 已接受 `UserPlatform`、`AssistantRuntime`、本地 CLI 和共享契约包的责任/信任边界，并明确断连不取消 Run。
  - `docs/architecture/decisions/0019-use-postgresql-runtime-truth-redis-coordination-and-mem0-facts.md` 已接受 PostgreSQL 耐久事实、Redis 可重建投影/协调、Mem0 抽取事实、checkpoint 与产品历史分离，以及 intent/`ResultUnknown`/fencing 原则。
  - `docs/architecture/decisions/0020-use-deep-agents-local-tool-gateway-and-ink.md` 已接受 Deep Agents/LangGraph adapter、远程 MCP 与 Local Tool Gateway 分离、CLI-owned 长进程、Ink、HTTP command 与 replayable SSE 方向。
- **协议代码**：`packages/contracts/src/assistant-runtime/protocol.ts` 新增 schema generation 1、受限 opaque ID、correlation/command/event/session/run IDs、带 offset timestamp、非负 resource version/sequence、四类 retry classification、幂等 command metadata、versioned resource reference、Session-bound before/after cursor、受限 error envelope 和 durable command-accepted envelope。
- **契约验证**：`packages/contracts/src/assistant-runtime/protocol.spec.ts` 新增 6 个 schema tests，覆盖合法 command/accepted/cursor 与未知 generation、非法 retry delay、嵌套 diagnostic detail 拒绝；`packages/contracts/src/index.ts` 已公开对应 schemas/types。
- **任务回执**：本切片审计确认 `tasks.md` 的 1.2（ADR）与 3.1（共享协议 primitives）已勾选；它们是架构/协议前置任务，不是任一产品 CAP 的完整实现任务。

#### 独立复验回执

在 `/Users/temptrip/Desktop/Project/ernest-bot-agent-pub` 现场重新执行：

| 命令                                                                               | 结果                                                                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @repo/contracts test`                                               | Vitest 6 files / 17 tests passed；其中本切片 `protocol.spec.ts` 为 6 tests，不能把其余既有测试归为本切片新增 |
| `pnpm --filter @repo/contracts check-types`                                        | `tsc --noEmit` passed                                                                                        |
| `pnpm --filter @repo/contracts lint`                                               | ESLint `--max-warnings 0` passed                                                                             |
| `pnpm --filter @repo/contracts build`                                              | `tsc -p tsconfig.build.json` passed                                                                          |
| `openspec validate implement-node-assistant-runtime --type change --strict --json` | `valid: true`、`issues: []`、1/1 passed                                                                      |
| `git diff --check`                                                                 | passed                                                                                                       |

#### 状态裁定

- **没有 CAP 晋级 `Implemented`**。CAP-001～CAP-032 全部保持 `Specified`。
- ADR 只固定长期决策；协议 primitives 只提供后续 commands/resources/events 的词汇和基础校验。仓库搜索未发现这些新协议 schemas 在 contracts 根导出与自身测试之外被 runtime、CLI 或 UserPlatform 生产路径消费。
- 该切片没有 UserPlatform、数据库 migration/repository、Run worker、event store、SSE replay、模型/harness、MCP/Gateway、HITL、Mem0、Ink reducer/view 或部署接线，因此不满足任何单项 CAP 的“完整生产路径 + 自动化行为证据”门槛。
- 本次单元测试只证明 schema 的已覆盖输入行为；不证明 command 幂等、resource version CAS、cursor 分页、error redaction、retry 执行或 command acceptance 已耐久生效。

#### 未验证项与后续风险

- `AssistantRuntimeErrorSchema` 将 detail 值限制为标量和长度上限，但 schema 本身不能判断合法字符串是否包含 secret；真正的字段 allowlist、生产者脱敏和日志负向测试仍由 CAP-031/CAP-029 实现切片负责。
- `retry_after` 当前只验证提供的 `retryAfterMs` 必须为正数，尚未用 discriminated union 强制该分类一定携带 delay，或禁止其他分类携带 delay；后续错误契约细化时需要明确这一不变量。
- Page cursor 目前是可验证的结构化值，不包含服务端签名、owner 验证、snapshot/high-water identity 或真实分页实现；CAP-005 仍只有规格证据。
- 本切片没有独立构建的 producer/consumer compatibility fixtures；`tasks.md` 3.2～3.8 仍未完成，不能把 3.1 扩大解释为“共享 Assistant 产品契约已完成”。
- ADR-0018/0019/0020 覆盖本切片要求的主要架构类别，但没有运行基础设施或故障场景回执；它们只支持 task 1.2 的决策记录完成，不支持产品能力晋级。

#### 工作树与用户既有改动边界

- 验收时 worktree 仍是未提交 dirty 状态；三个 ADR、OpenSpec change 和 `packages/contracts/src/assistant-runtime/` 均为 untracked 范围，普通 `git diff` 不会显示其内容，本次通过直接读取文件完成审计。
- 本轮只把 ADR-0018/0019/0020、`protocol.ts`、`protocol.spec.ts`、`packages/contracts/src/index.ts` 的相关增量，以及 tasks 1.2/3.1 作为本编码切片证据。
- `README.md`、`docs/architecture/README.md`、`packages/contracts/src/shared/health.ts`、lock/workspace/turbo 配置、Assistant app scaffolds、ping/echo 文件及其他 proposal/OpenSpec 改动已存在于共享 dirty worktree；本次验收不重新归属、不替实现者修改，也不据其存在扩大完成结论。
- 本次 Capability Auditor 未修改生产代码、测试、ADR、OpenSpec tasks 或 staging；只更新本台账。当前无提交、无 push、无发布证据。

### 6.2 2026-10-05 编码会话结束验收：PG / Redis / Mem0 环境配置切片

#### 审计对象与实际实现证据

- `apps/assistant-runtime-service/.env.example` 为 PostgreSQL、Redis 和 Mem0 提供无真实凭据的配置模板，并在注释中固定三层职责：PG durable source of truth、Redis reconstructable hot/lease/fan-out、Mem0 extracted facts。
- `apps/assistant-runtime-service/src/config/environment.ts` 提供启动时 normalization/validation：
  - PG host/port/user/password/database/schema、pool size、SSL；
  - Redis 仅接受 `redis:`/`rediss:` URL，并要求版本化 key prefix、hot-state TTL、lease TTL、command timeout；
  - Mem0 `platform` 模式要求 API key 并移除 base URL，`self_hosted` 模式要求 HTTP(S) base URL 并移除 API key；两种模式共享稳定 Agent scope、top-K、request timeout 和 extraction switch；
  - 错误只报告变量名和约束，不回显 secret value。
- `apps/assistant-runtime-service/src/app.module.ts` 已把 validator 接入全局 `ConfigModule.forRoot`，依次读取 `.env.local`、`.env.dev`、`.env`；这证明启动配置入口已接线，不证明外部依赖已连接。
- `apps/assistant-runtime-service/src/config/environment.spec.ts` 有 8 个展开后的配置测试，覆盖 platform normalization、self-hosted 条件分支、platform key 缺失、错误 Redis scheme、非正 lease TTL，并分别验证 `MEM0_USER_ID`、`MEM0_SESSION_ID`、`MEM0_RUN_ID` 被显式拒绝。
- `docs/guides/assistant-runtime-environment.md` 明确 PG/Redis/Mem0 的 SoR 边界、变量用途、生产 secret store、`synchronize: false` 方向、故障期望，以及 `userId` 来自认证身份、`runId`/Session scope 来自 owned Runtime resource，二者不得作为全局环境配置。
- `openspec/changes/implement-node-assistant-runtime/design.md` 在 Redis 决策中同步记录上述条件配置与动态 owner/Session scope 边界；`turbo.json` 允许相关构建/运行任务接收这些环境变量。
- 根 `.gitignore` 已显式忽略 `apps/assistant-runtime-service/.env.dev` 与 `.env.prod`；`.env.example` 继续作为可提交模板。
- `tasks.md` 2.5 仍保持未完成是正确的：该任务还要求 UserPlatform、CLI、object storage、encryption、model providers、MCP、leases 和 limits 的完整环境 schema 与逐项启动失败验证；本切片只覆盖 Runtime 的 PG/Redis/Mem0 子集。

#### 知识边界核对

| 边界                                                      | 审计结果                                                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 是确认会话与执行事实的 durable SoR             | 模板、validator、guide、design 一致；尚无 adapter/migration/runtime proof                                                                                                                 |
| Redis 只保存可重建 hot state、lease/coordination、fan-out | 模板、guide、design 一致；尚无 key implementation、projector、lease/fencing 或 PG rebuild proof                                                                                           |
| Mem0 只保存抽取事实，不保存聊天/checkpoint                | 模板、guide、design 一致；尚无 recall/extraction/provenance/correction/deletion adapter proof                                                                                             |
| Mem0 Platform 一期边界                                    | 目标 SPEC 已收敛为仅支持 Platform；当前 validator 的 `self_hosted` 分支只是待任务 2.5 删除的脚手架，不构成受支持能力                                                                      |
| `userId` / Session / `runId` 不得是 env                   | 已闭合本切片边界：它们不在模板、正式可用 key 或 `turbo.json` 中；validator 在 normalization 前显式拒绝 `MEM0_USER_ID`、`MEM0_SESSION_ID`、`MEM0_RUN_ID`，parameterized tests 分别覆盖三者 |

#### 独立复验回执

| 命令                                                                                                   | 结果                                                           |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `pnpm --filter assistant-runtime-service test`                                                         | Vitest 2 files / 10 tests passed；其中环境切片展开后为 8 tests |
| `pnpm --filter assistant-runtime-service check-types`                                                  | `tsc --noEmit` passed                                          |
| `pnpm --filter assistant-runtime-service lint`                                                         | ESLint `--max-warnings 0` passed                               |
| `pnpm --filter assistant-runtime-service build`                                                        | `nest build` passed                                            |
| `openspec validate implement-node-assistant-runtime --type change --strict --json`                     | `valid: true`、`issues: []`、1/1 passed                        |
| `git check-ignore -v apps/assistant-runtime-service/.env.dev apps/assistant-runtime-service/.env.prod` | 两个路径分别命中根 `.gitignore` 的专用规则                     |
| `git diff --check`                                                                                     | passed                                                         |

#### 状态裁定与未验证项

- **CAP-022、CAP-023 均保持 `Specified`，不晋级 `Implemented`；其余 CAP 状态不变。** 环境 schema 是必要前置，但没有生产 adapter、数据库 schema、Redis projection、Mem0 operation 或实际 Run 行为。
- 未运行 PostgreSQL、Redis 或 Mem0 实例；没有连接、readiness、TLS certificate、credential rotation、timeout、重连、Redis flush rebuild、Mem0 outage compensation 或 PG admission failure 的运行证据。
- 上一轮发现的动态 scope env 缺口已修复：validator 现在对 `MEM0_USER_ID`、`MEM0_SESSION_ID`、`MEM0_RUN_ID` 采取 fail-fast 拒绝，测试确实逐项注入并断言错误。该结论只证明配置边界，不证明未来 Mem0 adapter 已从认证 owner 和 owned Session/Run 正确派生 scope；后者仍需运行时测试。
- `.env.example` 的 platform API key 和 PG password 故意留空；直接复制但不补 secret 会启动失败。这符合 fail-fast，但本切片未执行真实 `AppModule` bootstrap 来保存完整错误回执。
- 当前 validator 仍接受 `self_hosted`，与收敛后的 Platform-only SPEC 存在已知实现差距；任务 2.5 必须删除该分支并增加 unsupported-mode 测试，在此之前不得宣称 Mem0 配置已对齐本 revision。
- `POSTGRES_SSL` 目前只有布尔开关；guide 已说明 provider certificate options 等待数据库 adapter。不能据此宣称生产 TLS 已闭合。
- `turbo.json` 只解决任务环境透传，不建立外部依赖，也不验证这些值参与缓存键或部署 secret 管理。

#### 工作树边界

- 本切片审计范围仅限用户点名的 `.env.example`、`environment.ts/.spec.ts`、`app.module.ts`、环境 guide、design 对应增量、`turbo.json` 环境增量，以及本轮用于保护 Runtime env 文件的根 `.gitignore` 两条专用规则；未把其他 dirty/untracked 文件重新归入本切片。
- 这些 Runtime app/config/guide/OpenSpec 文件处于共享未提交 worktree；本次 Auditor 未修改生产代码、配置、测试、OpenSpec 或 staging，只更新本台账。当前仍无 commit、push、部署或发布证据。

### 6.3 2026-10-05 编码会话结束验收：工具与协作契约切片

- `packages/contracts/src/assistant-runtime/tools-collaboration.ts` 新增 CAP-011～CAP-016 的版本化 Zod 契约与派生类型，覆盖公共 HTTPS MCP 配置、OAuth 四阶段、连接状态、目录 generation、固定目录快照的调用/结果，以及 CLI binding/lease/fencing、Local Tool、交互进程、编码工具、耐久 HITL 和独立 child Run SubAgent。
- Remote MCP 的凭证、OAuth state/code 只接受 `secret://` 引用；调用固定 `catalogGeneration` 与 `inputSchemaHash`。URL schema 静态拒绝明显本机/内网地址，DNS、redirect 与实际连接复查仍明确留给生产连接器。
- Local Tool request、ack、result 与进程命令/观察统一携带 `executionId`、正数 `attempt`、`bindingId`、SHA-256 `requestHash` 和非负 `fencingToken`；ack/result 另带 command id、idempotency key 与 expected version，receipt 区分首次接受、同请求重放和竞争冲突；非幂等断连可表达 `result_unknown`。
- 默认审批策略固定为工作区内 read/search 自动、patch 先展示 diff 再应用、shell 逐次确认、工作区外始终拒绝；Session 自动 shell 必须携带 `sessionId`/到期时间和请求采用的 policy version。requested/canonical path、进程 cwd 与 patch changed path 都使用 confinement 回执。
- 十类 baseline coding tool 各有实际 versioned input/result variant；Local Gateway 只接受六类 bound-CLI 工具。进程 start 不接收 caller handle，后续写入/resize/terminate 有独立 operation/idempotency identity，截断输出必须落 artifact。
- HITL 固定 allowed responders、secret mask、按 text/secret/single/multiple choice 分型的答案、question/approval 可用 resolution 组合与 accepted/replayed/conflict receipt。SubAgent 创建请求只引用耐久 parent snapshot/version 和 budget ledger version；服务端 admission contract 使用解析后的真实父权限/余额检查 owner/workspace、tools/memory 子集与预算，并要求 reservation 将 ledger CAS 到下一版；另有 parent cancellation 与自动结果回流契约。
- `tools-collaboration.spec.ts` 新增 11 个测试，覆盖上述正反场景，包括明文 auth reference、错误 MCP generation、canonical path 逃逸、错误工具参数、缺少 CAS/idempotency、HITL 类型错配、SubAgent 扩权/超预算。
- `packages/contracts/src/index.ts` 已显式导出本切片全部公共 schemas/types；`tasks.md` 3.6 已勾选。
- 本切片只完成 contracts，未接 MCP 网络、Gateway SSE/API、CLI executor/process registry、checkpoint resume 或 child-run orchestrator；CAP-011～CAP-016 均保持 `Specified`，没有晋级 `Implemented`/`Verified`。

### 6.4 2026-10-05 编码会话结束验收：Artifact、审计与交付门禁契约切片

- `packages/contracts/src/assistant-runtime/artifact-observability.ts` 新增 CAP-025/029/031/032 的严格 Zod 契约与派生类型；所有公共 object 拒绝未知字段，不提供 signed URL、bucket/object key、认证 token、正文、任意 debug map 或原始异常字段。
- Artifact 契约覆盖稳定 typed reference、image/non-image metadata、commit/failure、合法 byte range、统一 not-found-or-not-authorized 回执和 committed/failed event；metadata/reference 的 ID/version/hash/MIME/size 必须一致，失败分支不能携带成功 reference。`events.ts` 与工具/进程/SubAgent 的 artifact 字段已复用 typed reference，不再接受裸字符串。
- Session 删除 receipt 固定十一个步骤并要求 identity 唯一；mandatory steps 只能 deleted 或显式失败，`completed` 禁止失败，`partial_failure` 必须有失败步骤与 cleanup reference；Session Mem0 必须清理、user-scoped Mem0 与 independent forks 必须明确保留，blob 删除必须显式证明剩余引用为零；retry command 只列未完成步骤，archive 不能伪装成 irreversible delete。
- Observability 契约只允许 correlation opaque IDs 和受限 audit decision 字段；stale-fence rejection 必须记录不同的新旧 owner、严格递增 fencing token、denied fenced commit，不能携带 prompt/tool output 等 protected payload。
- Liveness、七类 dependency health、五项公网暴露控制和 command/stream/worker readiness 分开建模；关键 dependency 的必需 surface 由契约固定，载荷不能把 PostgreSQL 等依赖自行降级为“非必需”。生产环境任一公网控制关闭或必需依赖不可用时，对应 admission 必须为 false，且 `ready` 只能在三类 admission 全部为 true 时出现。
- 交付治理契约固定五级 CAP 状态、受限相对 evidence reference、独立审计、migration recovery 和 release gate：Verified 必须继承 specification、implementation、behavior test、runtime acceptance 与 independent audit 全部证据；审计各 evidence slot 的类别固定且作者不能自审；migration 必须分别验证 forward 和所选 rollback/roll-forward recovery；release gate 必须逐项包含 CAP-001～CAP-032 并披露 exclusions、untested platforms、known risks，仅全部 Verified 才能声明 approved target complete，exact baseline parity 永远为 false。
- `artifact-observability.spec.ts` 新增 12 个测试；连同 artifact event/tool reference 回归，contracts 现为 12 个文件、78 个测试。任务 3.7 只完成 contracts，未接对象存储、删除 saga、telemetry sink、health endpoint 或 release automation；CAP-025/029/031/032 均保持 `Specified`。

## 功能点总览（末尾验收清单）

- **访问与会话**：`CAP-001` 身份准入，`CAP-002` 所有权，`CAP-003` Session 生命周期。
- **运行与传输**：`CAP-004` 状态机，`CAP-005` 事件历史，`CAP-006` SSE replay，`CAP-007` Continue/Retry，`CAP-008` steer，`CAP-009` stop/cancel。
- **模型与工具**：`CAP-010` Model Catalog，`CAP-011` 远程 MCP，`CAP-012` Local Tool Gateway，`CAP-013` 长进程，`CAP-014` 编码工具，`CAP-015` HITL，`CAP-016` subagent。
- **上下文与恢复**：`CAP-017` crash recovery，`CAP-018` compact，`CAP-019` fork，`CAP-020` settings CAS，`CAP-021` AGENTS/Skills。
- **数据与记忆**：`CAP-022` Redis/PG，`CAP-023` Mem0，`CAP-024` Hook，`CAP-025` artifacts/images。
- **控制台与运维**：`CAP-026` Ink Session/History，`CAP-027` Ink 交互面，`CAP-028` usage，`CAP-029` observability/audit，`CAP-030` multi-replica/idempotency，`CAP-031` privacy/secrets，`CAP-032` release/acceptance。

只有当 `CAP-001`～`CAP-032` 都有通过验证的 OpenSpec 追溯、产品必需项均达到 `Verified`、`Kodex-unwired` 项已做明确决策，且未用 Node 增强替代目标内能力时，才能宣称“批准的 Node 目标范围完成”。Suggested Sessions 是已接线 baseline 的批准排除，因此任何状态下都不能把本版本描述为“精确/完整 Kodex baseline 对齐”。
