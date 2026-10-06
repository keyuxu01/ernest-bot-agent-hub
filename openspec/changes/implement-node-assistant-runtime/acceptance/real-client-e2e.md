# Approved Node target real-client E2E plan

## 功能点总览

本计划覆盖由固定 Kodex baseline 派生并经确认的全部 `CAP-001`～`CAP-032` 目标能力：身份与所有权、Session/Run/历史/SSE、用户自有模型连接与控制命令、HTTPS MCP 与本地工具、HITL/真正的 SubAgent、恢复/compact/fork/revert/settings、AGENTS/Skills、PostgreSQL/Redis/Mem0、Hooks、artifact/image、完整 Ink UI、usage、可观测性、多副本、安全删除和发布验收。Kodex Suggested Sessions 是用户批准的真实功能排除项，不得伪装成 SubAgent 覆盖，因此本计划不证明精确 Kodex parity。

## 1. 什么才算本项目的 E2E

必需 E2E 从打包后的 `assistant-cli` 进程或真实 PTY 启动，经过正常的 UserPlatform、AssistantRuntime、SSE、持久化和工具边界，最后从 CLI 可见结果与耐久证据断言。Codex 负责启动测试环境、操作 CLI、制造用户动作并收集脱敏回执。

`curl`、Postman、直接 HTTP/SSE、直接调用 service、只跑 controller test 或直接读写数据库均不算真实客户端 E2E。它们可以用于 API integration、fixture setup、故障注入或诊断，但不能替代下表的 CLI 路径。

每个面向用户的 capability 至少需要：

1. 一条 packaged CLI 正向路径；
2. 与该能力风险匹配的失败、并发、断线或越权路径；
3. CLI 结果、退出码或 PTY 屏幕断言；
4. 必要的 PostgreSQL/审计/日志交叉证据，且不含凭据和受保护正文；
5. 对应固定 Kodex baseline 行为或明确的 Node enhancement 差异说明。

[`scenario-trace.yaml`](./scenario-trace.yaml) 是规范 Scenario 到原子 E2E subcase、断言和证据 owner 的规范追溯清单。下表的 `E2E-xxx-*` 是执行套件，不替代原子 subcase；套件只有在它引用的全部 required subcase 均通过时才能通过。CI 必须拒绝缺失 Scenario、悬空 case、重复 case ID 和不存在的 suite 引用。

CAP-029 的运维观测、CAP-031 的 production admission/readiness 和 CAP-032 的迁移/证据晋级属于跨层或治理门禁：它们由 packaged CLI 触发真实产品行为，再由测试驱动读取只读运维证据；不得伪造不存在的 CLI 功能。迁移、secret scan 和独立审计仍由各自专用 gate 执行。

## 2. 测试环境与两级外部依赖

### 2.1 必跑、可重复环境

- 使用真实构建产物启动 UserPlatform、AssistantRuntime 和 `assistant-cli`。
- 使用真实 PostgreSQL、Redis、兼容对象存储、两个 Runtime replica、真实测试 MCP server 和两个隔离 workspace/CLI binding。
- Google Identity、两个模型 provider 和 Mem0 Platform 使用 contract-faithful hermetic server，以便稳定制造过期、429、5xx、断线、重复和部分失败。
- fixture 可以注入时钟、网络和进程故障，但不能绕过产品 API 完成用户操作。

### 2.2 发布前 live smoke

- 使用真实 Google OAuth 完成一次 loopback 登录和登出。
- 通过 CLI 输入真实公网 HTTPS base URL、API key 和自由模型名，完成 streaming、tool call 和 usage smoke；可选 reasoning effort/service tier 只在供应商支持时传递。
- 使用托管 Mem0 Platform 完成一次写入、跨 Session recall、纠正/删除和 owner 隔离 smoke。
- live secret 只来自进程环境或秘密管理器；命令、回执、日志和截图不得记录其值。
- live smoke 不能替代 hermetic failure matrix；hermetic fake 也不能单独证明真实供应商兼容。
- 三项 live smoke 使用独立 ID 与回执：`LIVE-GOOGLE-001`、`LIVE-MODEL-001`、`LIVE-MEM0-001`。任一真实凭据缺失时结果是 `Blocked/Not run`，不能计为 Pass，也没有以 hermetic 结果代替的 waiver；它只阻止需要该真实依赖的公开发布，不阻止本地实现自测。

## 3. 全功能真实 CLI E2E 矩阵

| 用例组                      | CAP              | 真实 CLI 主流程                                                                                                                                                                                                                                            | 必测失败/恢复/安全断言                                                                                                                                                                           |
| --------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `E2E-001-AUTH`              | CAP-001          | `assistant-cli` 发起 loopback Google OAuth，白名单用户登录后创建连接并打开 SSE                                                                                                                                                                             | 非白名单、伪造/重放 state、错误 PKCE、未登录、过期/错误 issuer/audience/signature、禁用后停止续签；已有请求和流最晚在五分钟 `exp` 失效；token 不出现在输出/日志                                  |
| `E2E-002-OWNER`             | CAP-002          | 用户 A 通过 CLI 创建 Session、Run、artifact、MCP、provider connection 和 binding，用户 B 使用自己的 CLI 正常操作自己的资源                                                                                                                                 | B 猜测 A 的 ID 时，各资源均不可读写；自定义模型 HTTPS 连接还须在 initial/redirect/actual-connect 阶段阻断私网、metadata 与 DNS rebinding                                                         |
| `E2E-003-SESSION`           | CAP-003          | CLI 创建、列表、打开、重命名、归档、取消归档和删除 Session，并观察自动标题                                                                                                                                                                                 | 自动标题与人工重命名竞争；归档不停止 Run；running Session 删除策略、重复命令、部分删除失败均有明确结果                                                                                           |
| `E2E-004-RUN`               | CAP-004          | CLI 提交 Turn，观察 Run 从排队、运行、等待到唯一终态，退出或断开 CLI 后重新打开                                                                                                                                                                            | 同 Session 并发 Run 被拒绝；重复 command 不创建第二 Run；每种 Waiting 状态只接受其唯一 resume authority，错误 authority 不改变状态；完成/stop 竞争和所有终态只有一个耐久结果                     |
| `E2E-005-HISTORY`           | CAP-005          | CLI 分页浏览文本、reasoning、plan、tool、interrupt、usage、compact 和 artifact 历史                                                                                                                                                                        | 大历史/稀疏历史不重不漏；并行工具乱序完成仍正确配对；重启恢复；未完成输出不伪装成稳定事件                                                                                                        |
| `E2E-006-SSE`               | CAP-006          | CLI 消费 Run 流，在任意 sequence 断线后携带 cursor 重连并继续渲染                                                                                                                                                                                          | Redis Pub/Sub 丢失、重复帧、sequence gap、慢消费者、Runtime 重启；重放完整有序且断流不隐式 stop                                                                                                  |
| `E2E-007-CONTINUE-RETRY`    | CAP-007          | CLI 运行由 provider 产生多次 Continue 后正常完成的 Turn                                                                                                                                                                                                    | Continue 不消耗错误重试；429/5xx 有限退避并在耗尽后可见；tool `ResultUnknown` 不被自动重放                                                                                                       |
| `E2E-008-STEER`             | CAP-008          | Run 活跃时从 composer 连续提交多个 steer，CLI 显示接收和应用顺序                                                                                                                                                                                           | 并发 steer、非法状态、Runtime 崩溃恢复、与 stop 竞争；每条只消费一次且顺序稳定                                                                                                                   |
| `E2E-009-STOP`              | CAP-009          | CLI 显式 stop Run 并观察 cancelling 到唯一终态                                                                                                                                                                                                             | 分别在 model delta、remote MCP、local tool、HITL、compact 阶段 stop；传播取消、清理进程树，SSE unsubscribe/CLI exit 不等同 stop                                                                  |
| `E2E-010-MODEL`             | CAP-002, CAP-010 | CLI 输入用户自有公网 HTTPS base URL、masked API key 和自由模型名，分别以两类 provider 完成 stream、tool 与 usage流程                                                                                                                                       | exact-model 测试；initial/redirect/actual-connect 全阶段 SSRF 重校验；密钥只以 PG ciphertext/reference 存在；Redis/CLI/日志无明文；可选参数不支持时显式失败                                      |
| `E2E-011-REMOTE-MCP`        | CAP-011          | CLI 配置、登录、启停公网 HTTPS MCP，刷新 catalog 并调用真实测试 MCP 工具                                                                                                                                                                                   | 非 HTTPS/stdio 全部拒绝；OAuth refresh/revoke、断线重连、旧 Run 保留原 schema、配置变更失效、大结果转 artifact；redirect/DNS rebinding 不得访问私网/metadata 目标                                |
| `E2E-012-LOCAL-GATEWAY`     | CAP-012          | 精确绑定的 CLI/workspace 通过 binding SSE 接收、ACK 并以 HTTPS 回传 local ToolExecution                                                                                                                                                                    | Session SSE 不含本机参数；同用户两设备不误投；读/搜自动、patch 展示 diff、shell 默认审批、Session auto 模式、workspace 外永久拒绝；断线、冲突结果和 unknown 正确                                 |
| `E2E-013-PROCESS`           | CAP-013          | CLI 启动 PTY/非 PTY 长进程，读取输出，随后 `write_stdin`、resize、轮询并取得退出码                                                                                                                                                                         | 大输出/backpressure、完成后尾输出、非 UTF-8、CLI/Runtime crash、stop 杀进程树且不伪造已知结果                                                                                                    |
| `E2E-014-CODING-TOOLS`      | CAP-014          | 在临时 workspace 逐项触发固定 baseline 的 `apply_patch`、`clock.curr_time`、`get_context_remaining`、`update_plan`、`exec_command`、`write_stdin`、`web.run`、`view_image`、`image_gen.imagegen`、`request_user_input` 和 `tool_search`/MCP deferred tools | `suggest_subagent_task` 记录为批准排除；其余每个 baseline tool 有独立 subcase；路径越界、patch 冲突、输出上限/artifact fallback、非幂等 unknown 均有精确断言                                     |
| `E2E-015-HITL`              | CAP-015          | CLI 展示并回答文本、选择和 approval interrupt，恢复同一 Run                                                                                                                                                                                                | secret 输入不回显；拒绝不伪造成成功；重复回答、断线重连、Runtime 重启和 stop 竞争只产生一次合法 resolution                                                                                       |
| `E2E-016-SUBAGENT`          | CAP-016          | CLI 启动可观察的真实 SubAgent child Run 并查看 lineage、状态和自动结果回流                                                                                                                                                                                 | child 并发、预算、结果回流、parent cancel 和崩溃恢复；不得扩大 owner/workspace/tool/memory 权限；不创建顶级 suggested Session                                                                    |
| `E2E-017-RECOVERY`          | CAP-017          | CLI 在 Runtime/worker 重启后重新打开仍在进行或等待的 Run                                                                                                                                                                                                   | 在模型流、外部调用前后、结果提交前后、HITL、compact 注入崩溃；不伪完成、不丢 pending、不盲目重放副作用                                                                                           |
| `E2E-018-COMPACT`           | CAP-018          | CLI 触发自动和强制 compact，查看覆盖边界并继续对话/执行 fork                                                                                                                                                                                               | pending tool/HITL 不被压入稳定摘要；换模型、中途崩溃、摘要失败保持旧投影；原始历史仍可查                                                                                                         |
| `E2E-019-FORK`              | CAP-019          | CLI 从指定稳定 event 创建独立复制 Fork，并分别执行 Revert、Revert and edit                                                                                                                                                                                 | Fork 复制 PG prefix/Session memory/artifact refs 但不复制 blob；删除源不影响目标；Revert 保持 Session ID；CAS 阻止 stale Run；两种 revert 与 Fork 不混同                                         |
| `E2E-020-SETTINGS`          | CAP-020          | 两个 CLI 实例修改 Session/user settings，观察版本与冲突 UI                                                                                                                                                                                                 | 同字段冲突、不同字段 refetch/reapply、自动标题竞争、丢回执、迟到投影；已接受 Run 使用原 snapshot                                                                                                 |
| `E2E-021-CONTEXT`           | CAP-021          | 临时 workspace 配置多层 AGENTS 和显式 Skill，CLI 审核并提交 immutable context snapshot                                                                                                                                                                     | 同名/优先级、运行中修改、大小超限、traversal/symlink、crash resume 和 fork；历史 Run 不读取未来文件                                                                                              |
| `E2E-022-PG-REDIS`          | CAP-022          | CLI 建立会话与 pending work 后清空/重启 Redis，再打开并继续                                                                                                                                                                                                | Redis unavailable、PG commit 后投影失败、热状态重建；history/settings/pending tool/HITL 不丢，Redis 从不成为唯一真源                                                                             |
| `E2E-023-MEM0`              | CAP-023          | CLI 在 Session A 提供偏好，完成抽取后在 Session B 触发 owner recall；检查、纠正、删除，并 Fork Session scope                                                                                                                                               | 禁止 API key/token/raw transcript/完整代码/patch/shell/tool output；Session memory fork 后独立；无信息增量不写、recall 不进历史、outage 补偿幂等；self-hosted 明确拒绝；另跑 Platform live smoke |
| `E2E-024-HOOKS`             | CAP-024          | CLI 配置并触发七类 Hook，观察顺序、允许/阻止、Stop bounded continuation 和通知结果                                                                                                                                                                         | timeout fail policy、Run 取消、UnhandledError Hook 失败不覆盖原错误、配置变更只影响后续 Run；Hook 不扩权或改写历史                                                                               |
| `E2E-025-ARTIFACTS`         | CAP-025          | CLI 查看图片、patch、大 stdout 和 MCP 结果产生的 artifact，并执行授权下载                                                                                                                                                                                  | 不支持 MIME、大小限制、跨用户访问、存储失败不发成功引用、Session 删除和孤儿清理                                                                                                                  |
| `E2E-026-INK-HISTORY`       | CAP-026          | 在真实 PTY 中完整操作 Kodex 历史/Terminal 侧栏、Session tree/search/archive、历史分页、renderer、keyboard/mouse 和 resize                                                                                                                                  | 所有侧栏动作/快捷键、远程 archive/stale projection、live→durable 替换、宽度/Unicode、重启恢复、空/大 catalog                                                                                     |
| `E2E-027-INK-OPERATIONS`    | CAP-027          | 在真实 PTY 中操作 composer、steer、stop、settings、自有 model/MCP、path、patch、artifact、AskUser 和 terminal pane                                                                                                                                         | 输入换行/提交偏好、idle/running 分流、CAS 冲突、path 越界、patch fallback、stdin 陈旧、focus/modal/mouse、窄终端/无 TTY；本地偏好不含 secret                                                     |
| `E2E-028-USAGE`             | CAP-028          | CLI 查看 provider-reported 与 estimated usage，并按 Turn/Run/Session 聚合；支持时展示 provider balance/reset                                                                                                                                               | provider 不支持时显示 Unavailable 而非 0；保留 provider timestamp；不存在 charge/top-up/invoice/payment/settlement 功能；聚合不重复计数                                                          |
| `E2E-029-OBSERVABILITY`     | CAP-029          | 从一次 CLI Run 的安全 correlation ID 追踪 UserPlatform、Runtime、model/MCP/tool 和最终事件                                                                                                                                                                 | 故障指标/告警可见；authorization、prompt、tool output、Mem0 文本、路径和 secret 哨兵不进入普通日志；普通用户不能篡改 audit                                                                       |
| `E2E-030-MULTI-REPLICA`     | CAP-030          | 两个 Runtime replica 竞争处理同一 Run，CLI 只看到一次合法进展与终态                                                                                                                                                                                        | lease 过期后旧 owner 迟到提交、Redis 分区/清空、PG 短断、重复 command/result；低 fencing epoch 的写入被拒绝                                                                                      |
| `E2E-031-SECURITY-DELETION` | CAP-031          | CLI 执行 Session/user 数据删除并查看逐存储结果，同时验证公网 readiness/admission gate                                                                                                                                                                      | token/provider/MCP key 轮换与日志脱敏；Mem0/artifact 部分失败可补偿；删除后缓存不复活；五项公网门禁任一缺失时 readiness=false 且 command/stream 不接收 production traffic；MCP SSRF 负向通过     |
| `E2E-032-DELIVERY`          | CAP-032          | 在全新环境安装并启动打包 CLI 和服务，完成上述矩阵及人工 TUI 验收                                                                                                                                                                                           | 任一 CAP 未 Verified 不得宣称批准目标完成；无论状态如何，Suggested Sessions 排除存在时不得宣称精确/完整 Kodex parity                                                                             |

## 4. 可执行 case 目录

### 4.1 Driver 与 fixture 约定

测试实现冻结四个相互独立的 driver/oracle surface：

1. **Product PTY driver**：`launch(user, workspace)`、`keys(...)`、`mouse(...)`、`resize(cols, rows)`、`paste(text)`、`choose(label)`、`type(text)`、`waitScreen(pattern)`、`disconnect()`、`relaunch()` 和 `exit()`；它只启动打包后的 `assistant-cli`，不导入 CLI 内部模块。
2. **Fixture controller**：`seed(manifestVersion)`、`health()`、`reset()` 和 `cleanup()`；它创建确定性用户、Session、workspace、provider/MCP/Mem0 响应及对象，记录 seed/hash，并在每个 atomic case 前后验证无泄漏状态。
3. **Fault controller**：使用可控时钟、DNS/HTTP fault proxy、进程信号、Redis/PG/Mem0/provider/MCP/object-store 开关和精确 kill point 制造故障；它不得直接伪造产品成功结果。
4. **Evidence oracle**：只读查询 PostgreSQL、Redis key inventory、对象元数据、审计、结构化日志和 telemetry；它只判定 CLI 不可观察的耐久/安全事实，不绕过 CLI 执行用户动作。

每个 atomic subcase 冻结 driver 版本、fixture manifest/hash、初始健康检查、动作序列、CLI/PTY 断言、只读 oracle、cleanup 结果和脱敏 receipt。`reset()` 必须清理 PostgreSQL 测试 schema、Redis namespace、对象前缀、Mem0 fake scope、测试 MCP/provider 状态和残留本机进程；`cleanup()` 或健康检查失败使该 case 无效而不是通过。

每个 subcase 还必须标记 `product-e2e`、`operational-acceptance`、`live-smoke` 或 `release-governance`。只有 `product-e2e` 计入真实客户端 E2E 数量；其他类型可以引用同一 canonical execution receipt，但不得重复执行或抬高 E2E 数量。

`scenario-trace.yaml` v2 中每个 `entries[].id` 本身就是一个 normative atomic case：它的动作是所引用 Scenario 的精确 `WHEN`，必须断言精确 `THEN`；fixture、driver、cleanup、closed oracle 和 canonical receipt 由该文件的 registry 确定。下面的 `E2E-xxx-yy` 表格是便于人执行的组合 journey，不替代 atomic ID，也不能把一个 journey 的部分成功计为多个 case 通过。`supplemental_cases` 则给非规范但高风险的 OAuth、竞争、逐工具与 live-smoke 路径稳定身份。

表格中的 `F2/F3` 等写法表示按从左到右组合两个确定性 overlay，不表示择一或分阶段；机器清单统一使用显式 fixture 数组。任何 overlay 冲突都必须在 seed 阶段失败，不能由执行器临时选择。

| Fixture | 内容                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `F0`    | 干净数据库、Redis、对象存储、UserPlatform、两个 Runtime、测试 Google/模型/Mem0/MCP，用户 A/B 与 workspace A/B                   |
| `F1`    | `F0` 加短 TTL token、可控时钟、错误 issuer/audience/signature 与 disabled user                                                  |
| `F2`    | `F0` 加可脚本化 stream、Continue/429/5xx、断线、重复/缺口/慢消费模型及 Redis fault proxy                                        |
| `F3`    | `F0` 加两个 CLI binding、临时 workspace、symlink/patch/image/大输出 fixture 和可控本地进程                                      |
| `F4`    | `F0` 加 pending MCP/local tool/HITL/compact、worker kill points、两 replica 与 fencing/PG/Redis fault proxy                     |
| `F5`    | `F0` 加大历史、large/empty catalog、窄/宽终端、Unicode、keyboard/mouse 与无 TTY runner                                          |
| `F6`    | `F0` 加密钥哨兵、分存储删除失败、SSRF redirect/DNS rebinding 与五项 readiness 开关                                              |
| `F7`    | live fixture 基础；Google、模型、托管 Mem0 各自按独立 smoke ID 只启用所需凭据、配额与 cleanup，秘密仅由环境/secret manager 注入 |
| `F8`    | 全新安装、旧 schema 备份、当前/前一兼容 CLI 和 Runtime 包、迁移/restore/rollback 环境                                           |

对外部副作用每个 commit point 的穷举放在 integration/fault harness；真实 CLI E2E 对每类边界选代表性 before/after 路径并收集跨层证据，避免组合爆炸。

### 4.2 身份、Session、Run、历史与流

| Case         | Fixture | CLI/PTY 操作                                                                                                                                                                           | 用户可见与耐久断言                                                                                                                                 |
| ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-001-01` | F0      | A 启动 CLI，选择 Login，完成 loopback OAuth，再打开 stream                                                                                                                             | CLI 显示已登录；UserPlatform 只给 allowlisted A 发五分钟 token；Runtime 本地验签且没有逐请求 introspection                                         |
| `E2E-001-02` | F1      | 分别执行非白名单、伪造/重放 state、错误 PKCE、缺 token、过期和错误 issuer/audience/signature                                                                                           | CLI 得到稳定未认证结果且无 token；禁用后不再签发/刷新，已有请求/SSE 最晚在五分钟 `exp` 关闭；输出和日志无 token                                    |
| `E2E-001-03` | F7      | 用 packaged CLI 在真实 Google 页面完成 loopback login，然后 logout 并再次访问受保护入口                                                                                                | 真实身份 subject 正确映射；logout/refresh 行为符合契约；命令、PTY snapshot、服务日志和回执均不含真实 token                                         |
| `E2E-001-04` | F6      | 将 CLI 的 UserPlatform 或 Runtime endpoint 配成 HTTP，或让 HTTPS endpoint 返回降级 redirect                                                                                            | CLI 在发送 OAuth code、token、command 或 stream 之前拒绝连接；blocked endpoint 未收到受保护数据                                                    |
| `E2E-002-01` | F0      | A 创建 Session/Run/artifact/MCP/settings/provider credential；B 在自己 CLI 中输入或选择 A 的资源标识                                                                                   | B 的 history/stream/fork/download/Mem0/MCP/settings/provider credential/interrupt/tool result 全部拒绝，UI 不泄露资源是否存在，存储无跨 owner 变更 |
| `E2E-002-02` | F3      | A 的第二设备和错误 workspace 尝试提交第一个 binding 的工具结果                                                                                                                         | CLI 显示 stale/wrong binding；pending execution 保持，审计只含安全标识                                                                             |
| `E2E-003-01` | F5      | A 在 empty catalog 创建多条 Session，分页/搜索/打开/重命名/归档/取消归档/删除                                                                                                          | empty 与 large catalog 渲染正确；排序/分页不重不漏；每个生命周期动作与 PG 状态一致                                                                 |
| `E2E-003-02` | F4      | 自动标题 pending 时人工重命名；运行中归档；对 running Session 发删除并注入外部删除失败                                                                                                 | 人工标题不被覆盖；归档不 stop；删除策略和 partial failure 明确、可重试且不谎报完成                                                                 |
| `E2E-004-01` | F0      | A 提交 Turn，观察 Queued→Running→Waiting→Running→terminal；断开再打开                                                                                                                  | CLI 恢复同一 Run；一个 Session 只有一个 active Run；重复 command 返回原结果，不创建第二 Run                                                        |
| `E2E-004-02` | F4      | 对 WaitingForLocalTool/McpTool/Human 分别提交错误 authority，再提交正确 result/answer；分别到达 Failed/Cancelled/ResultUnknown；对 terminal 再发 transition；并制造 stop/complete 竞争 | 错误 authority 不改变 wait；每个 wait 仅由匹配 authority 恢复；terminal 不可再转换；CAS 产生一个合法终态与一个 terminal event                      |
| `E2E-005-01` | F5      | CLI 向前/向后分页查看包含所有 event 类型的大历史                                                                                                                                       | sequence/event identity 不重不漏；tool request/result 正确配对；屏幕与 PG append-only history 一致                                                 |
| `E2E-005-02` | F4      | 并行工具逆序完成，输出中途杀 Runtime 后 relaunch                                                                                                                                       | completion order 明确；已提交历史恢复，未完成 chunk 不伪装成稳定 message/event                                                                     |
| `E2E-006-01` | F2      | streaming 中任意 sequence 断网，随后 relaunch/reconnect                                                                                                                                | CLI 用 cursor replay 完整后再接 live，无重复/缺口；Run 未被断流 stop                                                                               |
| `E2E-006-02` | F2      | 注入重复帧、gap、Pub/Sub 丢失、慢消费者和 Runtime 重启，并经过代理观察 heartbeat                                                                                                       | CLI 去重/检缺并从 PG 修复；慢客户端可恢复关闭；heartbeat 不占业务 sequence，响应禁用代理 buffering                                                 |

### 4.3 模型控制、MCP 与本地能力

| Case         | Fixture | CLI/PTY 操作                                                                                                                           | 用户可见与耐久断言                                                                                                                                           |
| ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `E2E-007-01` | F2      | 提交一个需要两次 Continue 才完成的 Turn                                                                                                | CLI 连续显示同一 Turn；Continue 不占 retry budget，attempt 与最终事件正确                                                                                    |
| `E2E-007-02` | F2      | 分别触发 429、5xx 至耗尽，并让非幂等 tool 在断线后成为 unknown                                                                         | 有限退避/耗尽可见；unknown effect 不自动重放，CLI 显示需处理状态                                                                                             |
| `E2E-008-01` | F2      | active Run 中连续和并发输入三条 steer                                                                                                  | CLI 显示三条已接受并在安全边界按接收顺序应用，每条恰好一次                                                                                                   |
| `E2E-008-02` | F4      | 在非法状态 steer；领取前后杀 worker；让 steer 与 stop 竞争                                                                             | 非法命令不消费；恢复不重复；stop 后未合法消费的 steer 不伪装已执行                                                                                           |
| `E2E-009-01` | F2/F3   | 分别在 model delta、remote tool、local process 中选择 Stop                                                                             | CLI 显示 Cancelling→唯一终态；取消传播，local process tree 终止且资源清理有结果                                                                              |
| `E2E-009-02` | F4      | 分别在 HITL、compact 中 Stop；另做 SSE unsubscribe 和 CLI exit                                                                         | HITL/compact 遵守取消契约；unsubscribe/exit 后 Run 继续或等待，不等同 Stop                                                                                   |
| `E2E-010-01` | F0      | CLI 输入公网 HTTPS base URL、masked API key 和自由模型名，完成连接测试及 stream/tool/usage                                             | exact model 被调用；PG 只有 ciphertext/reference；Redis、Session、CLI 配置、SSE 和日志均无明文 key                                                           |
| `E2E-010-02` | F0      | 分别留空、填写受支持和不受支持的 reasoning effort/service tier，并在 Run 接受后改 Session 默认模型                                     | 未填参数不发送；支持值透传；不支持时显式失败；active Run 保留原 snapshot，后续 Run 使用新默认值                                                              |
| `E2E-010-03` | F7      | 用 packaged CLI 输入真实 provider 配置，完成一次 streaming、tool call 和 usage 展示                                                    | 真实 provider 与 catalog/stream/tool/usage 映射兼容；回执仅记录模型标识和脱敏结果，不记录 credential/prompt 私密内容                                         |
| `E2E-010-04` | F6      | CLI 保存模型连接时让 hostname 初始解析公网，随后在 redirect 或实际 socket connect 前重绑定到 loopback/private/link-local/metadata 地址 | 每次 actual connection 都重新校验并在发送 API key/model request 前拒绝；blocked endpoint 收不到请求或凭据                                                    |
| `E2E-011-01` | F0      | CLI 创建/查看/修改/启用/停用/删除公网 HTTPS MCP connection，执行 login、refresh、logout 和真实测试工具                                 | CRUD/lifecycle/catalog generation 可见；secret 不回显；stdio 和非 HTTPS 配置明确拒绝；logout/revoke 后调用被阻止                                             |
| `E2E-011-02` | F2/F6   | MCP 断线重连、catalog 变更、大结果、redirect 到私网/metadata 和 DNS rebinding                                                          | 已接受调用保留旧 schema；大结果成为 owned artifact；任何实际 blocked 连接前拒绝且不发送凭据                                                                  |
| `E2E-012-01` | F3      | 两个设备在线，由 Run 请求 exact binding 执行本地工具，目标 CLI 从 binding SSE ack 并通过配置的服务传输提交                             | 开发联调走 HTTP localhost、非本地/生产走 HTTPS；只目标设备/workspace 收到；Session SSE 不含参数/文件内容；ToolExecution 先耐久后投递；终态 result 只接受一次 |
| `E2E-012-02` | F3/F4   | CLI 离线后重连，提交 duplicate/conflict/stale fence/wrong workspace result，并在 side effect 后断线                                    | 安全 redelivery 与 unknown 分类正确；错误结果不改变 pending；不得把可能执行的非幂等工具静默重跑                                                              |
| `E2E-012-03` | F3      | 依次执行 workspace 内 read/search、patch、shell；再开启本 Session auto 模式并尝试 workspace 外路径                                     | read/search 自动；patch 先展示 diff 后应用；默认 shell 等待批准；Session auto 仅免除 workspace 内确认；越界始终拒绝                                          |
| `E2E-013-01` | F3      | 从 CLI 启动 PTY/非 PTY 命令，轮询输出，write_stdin、resize，完成后再读 tail                                                            | 稳定 process handle、stdout/stderr、exit code 和 tail 正确；stdin 只到目标进程                                                                               |
| `E2E-013-02` | F3/F4   | 产生大输出/非 UTF-8，stop 进程树，并在 CLI/Runtime crash 后恢复                                                                        | backpressure 有界；输出安全降级；子进程清理；known/unknown 结果不被伪造                                                                                      |
| `E2E-014-01` | F3      | 逐项让 agent 经 CLI 执行 `apply_patch/clock.curr_time/get_context_remaining/update_plan/exec_command/write_stdin/web.run`              | 每个固定 baseline direct tool 都有真实结果和耐久 ToolExecution；approval、timeout、output bound 与 location 正确                                             |
| `E2E-014-02` | F3      | 通过 `tool_search` 找到并执行 `view_image`、`image_gen.imagegen` 和 HTTPS MCP deferred tool；触发 `request_user_input`                 | deferred discovery/执行正确；AskUser 完整经历暂停、CLI 回答、耐久恢复且不依赖额外策略开关；`suggest_subagent_task` 仅作为批准排除记录，不进入运行目录        |
| `E2E-014-03` | F3      | patch 冲突、traversal、symlink escape、拒绝 approval、大结果和 side-effect 后断线                                                      | workspace 外无读写；冲突不覆盖；拒绝/unknown 明确；Node 额外 file/search 能力在回执标记 enhancement 而非 baseline parity                                     |

### 4.4 HITL、subagent、恢复、compact、fork 与 settings

| Case         | Fixture | CLI/PTY 操作                                                                                                   | 用户可见与耐久断言                                                                                                             |
| ------------ | ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `E2E-015-01` | F0      | 回答 text/choice/approval/secret interrupt，再对同一 interrupt 重试相同答案                                    | secret 不回显/不进日志；同 key 返回原结果且只恢复一次                                                                          |
| `E2E-015-02` | F4      | 拒绝危险操作；提交冲突的第二答案；断线/Runtime restart 后回答；与 Stop 竞争                                    | 拒绝不伪造成工具成功；冲突答案拒绝；pending 可恢复；只有一个 resolution/terminal outcome，未知投递明确                         |
| `E2E-016-01` | F4      | 启动并发 SubAgent child Runs，观察结果自动回流，再触发预算耗尽、parent stop、child crash 和越权 workspace 请求 | lineage/状态可见；结果进入 parent；取消/恢复正确；权限和预算只能继承或缩小；不创建顶级 Session                                 |
| `E2E-016-02` | F4      | 让模型提出多个后续任务并遍历 packaged CLI collaboration commands、menus 与 contracts                           | 不出现 Suggested Sessions command、确认批次或顶级 Session 创建；回执记录其 baseline anchor、批准排除和未计入 SubAgent coverage |
| `E2E-017-01` | F4      | 在 model stream、tool intent 前/后、result commit 前/后各选一个代表 kill point，relaunch CLI                   | accepted Run 从耐久状态恢复；不丢 pending、不伪完成、不重复已知副作用                                                          |
| `E2E-017-02` | F4      | 在 HITL 和 compact 时清空 Redis并重启 Runtime                                                                  | 相同 interrupt/compact state 从 PG 恢复，Redis 重建，不重新执行前序副作用                                                      |
| `E2E-018-01` | F5      | 触发自动/强制 compact，查看 covered sequence，继续 Turn 并从 compact 前后 fork                                 | 摘要激活边界、token metadata 和继续上下文正确；原始历史仍可分页                                                                |
| `E2E-018-02` | F4      | compact 时保留 pending tool/HITL，分别注入模型切换、摘要失败和 crash                                           | pending 不进入稳定摘要；失败/崩溃保持旧投影，恢复后无半提交 compact                                                            |
| `E2E-019-01` | F5      | 从 latest、指定 event、compact 前后分别 Fork 并继续输入                                                        | PG committed prefix、settings/context/checkpoint 和 Session memory 复制；artifact 仅复制引用；源/叉历史独立                    |
| `E2E-019-02` | F4      | 在 pending tool/HITL 前 fork，制造并发 append 和 command response 丢失后 retry，再删除 source                  | 未决/后续事件不复制；幂等 retry 不重复建 fork；target 历史/记忆/仍引用 artifact 完整可用                                       |
| `E2E-019-03` | F5      | 对同一历史点分别执行 Revert to here 与 Revert and edit，并制造 stale Run/CAS 竞争                              | Revert 保持 Session ID 并切换 active head；edit 只追加一次新输入/Run；stale commit 被拒绝；两者均不创建 Fork                   |
| `E2E-020-01` | F0      | 两个 CLI 同时编辑 settings 的不同字段，再编辑同一字段                                                          | 不同字段经 refetch/reapply 保留；同字段 CAS conflict 且 UI 保留草稿                                                            |
| `E2E-020-02` | F4      | settings 回执丢失、迟到 projection、自动标题竞争，并在 active Run 后修改 model                                 | 重试不盲写；人工标题保留；active Run 使用接受时 snapshot，后续 Run 用新值                                                      |

### 4.5 Context、PG/Redis、Mem0 与 Hooks

| Case         | Fixture | CLI/PTY 操作                                                                                                       | 用户可见与耐久断言                                                                                               |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `E2E-021-01` | F3      | workspace 放置多层 AGENTS 和同名显式 Skill，CLI 审核 snapshot 后启动 Run                                           | precedence、relative source、hash/trust metadata 正确，模型使用接受的内容                                        |
| `E2E-021-02` | F3/F4   | 接受后修改文件；测试超限、traversal/symlink；crash resume 与 fork                                                  | 越界不上传；已接受 Run/recovery/fork 不读取未来文件                                                              |
| `E2E-022-01` | F4      | 建立 history/settings/pending tool/HITL 后 flush/restart Redis，再 relaunch                                        | CLI 从 PG 恢复全部耐久事实，hot projection 可重建                                                                |
| `E2E-022-02` | F4      | Redis unavailable，以及 PG commit 后 projection 失败                                                               | 已确认命令/事件不丢；执行可降级或暂停但不谎报；Redis 恢复后收敛                                                  |
| `E2E-023-01` | F0      | Session A 输入偏好，抽取后 Session B 使用 user fact；测试 Session-scoped fact、Fork、重复/无增量、查看、纠正和删除 | recall 只进临时 context；user fact 跨 Session；Session fact fork 后独立；无重复写；inspect/correct/delete 可观察 |
| `E2E-023-02` | F4      | Mem0 outage 后完成 Turn，恢复依赖并执行补偿                                                                        | 对话仍完成；PG 记录未完成状态；恢复后补偿幂等且不重复记忆                                                        |
| `E2E-023-03` | F0      | 以 `MEM0_MODE=self_hosted` 启动当前版本                                                                            | 启动明确拒绝不支持模式并给出行动提示，不伪装 Platform 或本地服务成功                                             |
| `E2E-023-04` | F6      | 分别在候选记忆中放 API key、token、raw transcript、完整代码、patch、shell 和未处理 tool output                     | 每类候选在写 Mem0 前被拒绝；Mem0、日志、补偿记录和回执均无受保护正文                                             |
| `E2E-024-01` | F3      | 配置七类 Hook 并从 CLI 触发 ordered allow/block、Post、Pre/PostCompact、Stop bounded continuation、UnhandledError  | 顺序与 controlling result 可见且耐久；block 后工具不执行；bounded continuation 有上限                            |
| `E2E-024-02` | F4      | Hook timeout、Run cancel、UnhandledError Hook 失败、active Run 中更新 Hook config                                  | fail policy/cancel 正确；原错误不被覆盖；当前 Run 保留 snapshot；Hook 不扩权或改写历史                           |

### 4.6 Artifact、Ink UI、usage、observability 与多副本

| Case         | Fixture | CLI/PTY 操作                                                                                                            | 用户可见与耐久断言                                                                                                             |
| ------------ | ------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `E2E-025-01` | F3      | CLI 打开 image、patch、大 stdout、MCP artifact，执行授权下载/范围读取                                                   | MIME/size/hash/owner/Session/Run 关联正确，renderer 使用稳定 identity                                                          |
| `E2E-025-02` | F6      | unsupported MIME、存储失败、跨用户访问、Session 删除和 orphan cleanup                                                   | 不发不存在的成功引用；越权拒绝；删除/partial cleanup 可重试                                                                    |
| `E2E-026-01` | F5      | 真实 PTY 用 keyboard/mouse 完整操作固定基线的历史侧栏、Terminal 侧栏、tree、搜索、filter、多 tab、大历史与所有 renderer | 每个动作/快捷键、focus/selection/modal containment 正确；live/durable 无重复；导航不改后端事实                                 |
| `E2E-026-02` | F5      | 调整两侧栏显示/宽度和输入换行/提交设置，stream 中 resize 为窄终端、断线并重启 CLI                                       | 完整偏好恢复；essential history/composer/modal 可达；projection 从 Runtime 恢复；本地配置无 key/token                          |
| `E2E-027-01` | F5      | idle submit、active steer、stop；编辑 settings、自有 model/MCP/path；查看 patch/artifact/AskUser/terminal               | 每个 UI 动作调用正确 distinct command，状态/冲突/approval 可见；model 自由输入，可选参数未设则不发送                           |
| `E2E-027-02` | F3/F5   | CAS conflict、path 越界、patch fallback、stale process stdin、focus/modal/mouse，并用 non-TTY 启动                      | 草稿保留；无越界/误投；窄终端与 non-TTY 给可访问诊断而非崩溃                                                                   |
| `E2E-028-01` | F2      | provider 有 usage 的 stream 经 Continue/retry 完成，查看 Turn/Run/Session 聚合和 compact 前后                           | final usage 只计一次，层级聚合一致，source/price version 可见                                                                  |
| `E2E-028-02` | F2      | provider 缺 usage/cost/account limit                                                                                    | CLI 分别显示 unavailable/estimated/provider-reported，不把未知值显示为 0                                                       |
| `E2E-028-03` | F2      | provider adapter 返回 account balance、reset time 和 provider timestamp                                                 | CLI 明确标记 provider-reported balance/reset 并保留 timestamp，不推算缺失账单数据                                              |
| `E2E-028-04` | F5      | 对不支持 account adapter 的 provider 打开所有 usage/settings 页面并搜索操作入口                                         | balance/reset 显示 Unavailable；CLI、contracts 与 command catalog 均没有 charge/top-up/invoice/payment/billing-settlement 动作 |
| `E2E-029-01` | F0/F3   | 由 CLI 完成包含 model、MCP、local tool、artifact 的 Run，再用 correlation ID 查只读测试 telemetry                       | 跨服务链路可关联；对应 auth/owner/settings/tool/fork/delete/audit 类别由相关 case 交叉覆盖                                     |
| `E2E-029-02` | F6      | 在 prompt/tool/Mem0/path/header 放 secret 哨兵并制造故障；普通用户尝试改 audit                                          | 日志/trace/metric/audit 无受保护正文或高基数字段；告警出现；audit 不可篡改                                                     |
| `E2E-030-01` | F4      | 两 replica 同时竞争一个 Run，然后让 lease 过期并允许旧 owner 迟到提交                                                   | CLI 只见一次进展/终态；旧 fence 写入被 PG 拒绝并留下安全审计                                                                   |
| `E2E-030-02` | F4      | Redis partition/flush、PG 短断、duplicate command/result                                                                | 恢复后状态收敛，无双执行/双终态；idempotent retry 返回原 outcome                                                               |

### 4.7 安全删除、治理与发布

| Case         | Fixture | CLI/PTY 或 gate 操作                                                                                                                | 用户可见与耐久断言                                                                                                                     |
| ------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-031-01` | F6      | CLI 删除 Session/user data，并分别让 Mem0/artifact cleanup 失败后 retry                                                             | CLI 显示逐存储 partial result；成功步骤不重做；删除内容不被 Redis/cache 复活                                                           |
| `E2E-031-02` | F6      | 由 CLI 请求 command/stream，同时逐一关闭 auth、owner、request/stream limit、concurrency、model-cost gate                            | 运维只读证据显示 readiness=false，production admission 不把流量送到 command/stream；五项全开才继续检查其他依赖                         |
| `E2E-031-03` | F6      | 轮换 token/provider/MCP key 并执行含 secret 的失败流程；配置 SSRF redirect/rebinding；读取只读持久化快照                            | 新凭据生效且旧凭据按契约失效；任何输出/日志/事件无 secret，at-rest 仅有 ciphertext 或 secret reference；blocked target 未收到请求/凭据 |
| `E2E-032-01` | F8      | 全新安装后用 packaged CLI 完成代表性 login→Session→Run→stream→tool→history 流程，再做 forward migration/restore/rollback            | 安装与迁移可复现，兼容窗口内数据/CLI 行为保持，失败有 roll-forward/rollback 回执                                                       |
| `E2E-032-02` | F8      | 校验发布产物 hash/signature/provenance，运行 current/previous CLI×Runtime 兼容矩阵及依赖故障，然后执行完整 case manifest 和人工 TUI | 无法验证真实性的产物拒绝发布；不兼容版本明确拒绝；已知限制记录；全部 required receipt 指向同一冻结 revision                            |
| `E2E-032-03` | F8      | 仅提供 compile green 的候选，再提供没有独立 auditor 的候选，最后提供缺一个 CAP receipt 的候选                                       | 三者均不得晋级 Verified/目标完成；全部门禁成立只允许声明批准目标完成，仍不得声明精确 Kodex parity                                      |

## 5. 执行与回执规则

每个用例记录：case ID、关联 CAP/requirement、baseline SHA、源码/测试 manifest、服务与 CLI 构建版本、测试数据、脱敏命令、退出码、关键 CLI/PTY 断言、耐久证据、日志扫描结果、失败注入点、限制和 artifact hash。

以下结果不能单独将 capability 提升到 `Verified`：单元测试、controller/Supertest、直接 HTTP/SSE、静态配置、mock service 被调用、task checkbox、代码存在、编译通过或未实际运行的手工步骤。

验收顺序为：实现完成并自测 → Codex 启动隔离环境 → 操作 packaged CLI 跑对应 E2E → 全绿后冻结 source/test/evidence manifests → 独立 Capability Auditor 按风险抽查并核对 Kodex baseline → coordinator 更新台账。不是 tests-first/TDD 门禁。

## 功能点结束清单

- `E2E-001`～`E2E-010`：身份、所有权、Session、Run、历史、SSE、Continue/Retry、steer、stop、model。
- `E2E-011`～`E2E-016`：remote MCP、Local Tool Gateway、长进程、编码工具、HITL、subagent。
- `E2E-017`～`E2E-024`：恢复、compact、fork、settings、AGENTS/Skills、PG/Redis、Mem0、Hooks。
- `E2E-025`～`E2E-032`：artifact/image、两组 Ink UI、usage、observability、多副本、安全删除和最终交付。
- 只有 32 组均有同一冻结 revision 的有效回执，且 capability ledger 的 32 项均为 `Verified`，才可以声明批准的 Node 目标范围完成；由于 Suggested Sessions 被排除，不能声明精确或完整 Kodex baseline parity。
