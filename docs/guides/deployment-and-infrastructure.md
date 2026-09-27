# 部署与基础设施指南

本文记录第一阶段已确定的部署边界、状态归属和后续演进条件。它描述目标架构，不表示 RabbitMQ、
Redis、Docker Compose 或生产部署清单当前已经实现；具体接入必须通过独立 OpenSpec 变更完成。

## 第一阶段结论

| 领域               | 选择                             | 状态                              |
| ------------------ | -------------------------------- | --------------------------------- |
| Web                | Vercel 上的 Next.js              | 已选型，Vercel 尚未开通或创建项目 |
| 域名与 DNS         | `ernestbot.com` / Cloudflare DNS | Zone 已存在，业务记录尚未配置     |
| 公网入口           | Cloudflare Worker                | 已选型，尚未部署或绑定域名        |
| NestJS API 运行时  | Cloudflare Containers            | 已选定，待部署实现                |
| NestJS Consumer    | 独立常驻容器运行时               | 平台待定，后续讨论                |
| 普通业务 API       | oRPC over HTTP                   | PoC                               |
| 消息系统           | RabbitMQ                         | 已选定，待接入                    |
| 缓存与协调         | Redis                            | 已选定，待接入                    |
| 本地基础设施       | Docker Compose                   | 已选定，待实现                    |
| 生产 Kubernetes    | 第一阶段暂不引入                 | 已选定                            |
| 数据库 / Vector DB | 尚未选择                         | 待决策                            |

“已选型”只表示架构决策已经接受，不表示供应商资源已经购买、项目已经创建或生产环境已经部署。

## 当前开通状态

- `ernestbot.com` 已接入 Cloudflare，权威 DNS 由 Cloudflare 管理；
- Vercel 尚未开通，Next.js 项目尚未创建，当前不存在 Vercel 域名验证 pending；
- Cloudflare Worker 与 Container 尚未部署，`api.ernestbot.com` 尚未绑定；
- 在 Vercel 项目给出实际 DNS 要求前，不预先添加指向 Vercel 的 A 或 CNAME 记录。

## 域名与托管平台的关系

`ernestbot.com` 可以继续由 Cloudflare 管理权威 DNS，同时作为 Vercel 项目的生产域名。域名无需
转移到 Vercel；DNS 管理方和应用托管方是两个独立角色：

| 域名                | DNS 管理方 | 应用托管方                     | 用途            |
| ------------------- | ---------- | ------------------------------ | --------------- |
| `ernestbot.com`     | Cloudflare | Vercel                         | Next.js 主站    |
| `www.ernestbot.com` | Cloudflare | Vercel 或重定向到主域名        | 可选 Web 别名   |
| `api.ernestbot.com` | Cloudflare | Cloudflare Worker / Containers | NestJS 业务 API |

开通 Vercel 后，先在 Vercel 项目中添加 `ernestbot.com`，再按照该项目 Domains 页面显示的实际值
配置 Cloudflare DNS。Vercel Web 记录初期使用 **DNS only（灰云）**，避免 Cloudflare Proxy 与
Vercel CDN/WAF 形成不必要的双层代理；`api.ernestbot.com` 则直接绑定到 Cloudflare Worker。

## 目标拓扑

```text
ernestbot.com                           api.ernestbot.com
Vercel（待开通）                        Cloudflare（待部署 Worker）
+-------------------+                   +------------------------+
| Next.js Web       | -- HTTPS/oRPC --> | Worker                 |
+-------------------+                   | CORS / WAF / routing   |
                                        | scheduled trigger      |
                                        +-----------+------------+
                                                    |
                                                    v
                                        +------------------------+
                                        | NestJS API Containers  |
                                        | oRPC / MCP / producers |
                                        +-----------+------------+
                                                    |
                                             publisher confirm
                                                    v
                                        +------------------------+
                                        | Managed RabbitMQ       |
                                        +-----------+------------+
                                                    |
                                               manual ack
                                                    v
                                        +------------------------+
                                        | NestJS Consumer Runtime|
                                        | provider pending       |
                                        +------------------------+

NestJS API and Consumer Runtime
  ├── Managed Redis: cache / locks / rate limits / short-lived state
  ├── Database: business facts / job records / idempotency
  ├── R2: source documents and large objects
  └── Vector DB: embeddings and vector indexes
```

## Worker 与 Container

Cloudflare Worker 是公开控制面，适合域名入口、CORS、WAF、轻量路由和定时触发。Cloudflare
Container 提供完整 Linux/Node.js 运行环境，用于请求驱动的 NestJS API、oRPC、MCP 和业务依赖。

所有 Container 请求先经过 Worker。Container 可能冷启动、休眠或在发布时被替换，本地磁盘也是
临时的，因此持久状态必须外置。RabbitMQ Consumer 需要保持 AMQP 连接，所以必须使用独立、持续运行
且受监督的运行时，不和可能缩容或休眠的 API Container 共用生命周期。具体平台暂未决定；候选方案
包括 Cloudflare Containers 配合显式生命周期管理，以及外部常驻容器平台。GCP Cloud Run Worker
Pools 只是候选项，不是已接受决策。

## 跨域策略

`ernestbot.com` 与 `api.ernestbot.com` 是不同 Origin。浏览器直接访问 `api.ernestbot.com`，不通过
Vercel 同源代理。Cloudflare Worker 负责：

- 精确允许生产 Web Origin；
- 开发环境单独允许 `http://localhost:3000`；
- 响应 `OPTIONS` 预检；
- 只允许 API 实际需要的方法和请求头；
- 返回 `Vary: Origin`；
- 使用 Cookie 时返回精确 Origin 与 `Access-Control-Allow-Credentials: true`，禁止 `*`。

生产、Preview 和本地 Origin 必须分环境显式配置，不能用后缀匹配放开任意来源。

## 定时任务

### 职责边界

| 职责               | 生产 Owner                               | 不负责什么                   |
| ------------------ | ---------------------------------------- | ---------------------------- |
| 何时触发           | Cloudflare Cron Trigger / 外部 Scheduler | 不执行业务流程               |
| 可靠保存与投递命令 | RabbitMQ                                 | 不计算调度时间，也不启动进程 |
| 执行业务逻辑       | NestJS Consumer 调用 use case            | 不作为生产调度时钟           |
| 记录执行结果       | 数据库                                   | 不依赖 Container 本地状态    |

生产链路固定为：

```text
Cloudflare Cron Trigger
  -> 发布版本化命令到 RabbitMQ
  -> NestJS Consumer 收到命令
  -> 调用可独立测试的 use case
  -> 数据库记录任务状态与幂等结果
```

Cloudflare Cron 只决定“什么时候产生任务”；RabbitMQ 负责在 Consumer 暂时不可用时保留已经产生的
任务；NestJS 负责“具体做什么”。RabbitMQ 不是 scheduler，也不会因为队列中出现消息而启动已停止或
休眠的 NestJS Container。关键 Consumer 必须常驻在受监督、可自动重启且不会缩容到零的运行时，或
额外具备显式启动与周期性 watchdog。

### Consumer 探针与 watchdog

业务服务提供三个职责不同的探针：

| Endpoint         | 用途        | 判断内容                                                     |
| ---------------- | ----------- | ------------------------------------------------------------ |
| `/health/live`   | Liveness    | NestJS 进程能够响应；不等待 RabbitMQ、数据库等外部依赖       |
| `/health/ready`  | Readiness   | 当前是否可以接活；接入 RabbitMQ 后必须检查连接和订阅状态     |
| `/health/whoami` | Instance ID | 返回服务名、实例/部署标识、版本和 uptime，不返回环境变量内容 |

`whoami` 用于确认正在响应的是哪个实例，不能代替 readiness。当前 PoC 尚未接入 RabbitMQ、Redis 和
数据库，因此 `/health/ready` 暂时只表示 NestJS 已完成启动；每项生产依赖接入时必须同步增加对应
readiness indicator。

接口名称不决定探针类型。若 Cloudflare Cron、Durable Object Alarm 或外部监控定期调用 `whoami`，
它就是 watchdog 的 liveness/identity 探针；若只由人工访问，它只是诊断接口。为兼容团队习惯，生产
watchdog 可以调用 `/health/whoami`，但还必须调用 `/health/ready` 判断 Consumer 是否真的能够消费。

推荐组合不是“依靠 ping 维持进程”，而是：

```text
Always-on NestJS Consumer
  ├── /health/whoami  -> 确认实例、部署版本和 uptime
  ├── /health/live    -> 确认 NestJS 进程能响应
  └── /health/ready   -> 确认 RabbitMQ 连接和 Consumer 已注册

Cloudflare watchdog
  └── 周期探测 -> 连续失败 -> 显式启动/重启 -> 告警

RabbitMQ
  └── Consumer 离线期间保留持久化消息，恢复后重新投递
```

若最终选择 Cloudflare Containers 承载 Consumer，必须同时配置：

- Container 启动探针指向 `/health/ready`；
- Consumer 的空闲生命周期不得使用会自动停机的默认 `sleepAfter` 行为；
- Durable Object Alarm、Cloudflare Cron 或外部监控周期性执行 watchdog；
- watchdog 检测停止或连续失败后显式启动/重启固定 Consumer 实例，并发送告警；
- 非预期退出通过 `onStop` / `onError` 记录原因，Consumer 处理 `SIGTERM` 并停止拉取新消息；
- 只有业务副作用持久化完成后才 ack，重启后由 RabbitMQ 重新投递未确认消息。

周期探针请求可以刷新活动计时，但“不断 ping”本身不是完整的常驻保证：网络故障、watchdog 故障或
Container 崩溃仍需显式恢复逻辑。RabbitMQ 负责保留消息，watchdog 负责恢复计算进程，两者缺一不可。

### 学习笔记：这是防御性编程吗

是，但更准确地说，它同时属于三个层次：

- **防御性编程**：输入校验、幂等键、超时、有限重试、优雅停机，不假设单次执行一定成功；
- **韧性工程**：健康探针、进程监督、自动重启、补偿扫描和告警，让系统在故障后恢复；
- **纵深防御**：Consumer、watchdog、RabbitMQ 和数据库分别承担不同保障，任何单点失效都不直接
  导致任务丢失。

这里防御的不是恶意攻击，而是正常分布式系统故障。设计原则是：**默认进程会退出、网络会断开、
消息会重复、监控也可能短暂失效；系统仍需做到可检测、可恢复、可重放且业务副作用不重复。**

| 故障场景                    | 检测方式                            | 恢复方式                   | 数据安全线                          |
| --------------------------- | ----------------------------------- | -------------------------- | ----------------------------------- |
| NestJS 进程卡死或退出       | `live` / `whoami` 超时              | watchdog 重启并告警        | 未 ack 消息由 RabbitMQ 重新投递     |
| RabbitMQ 连接或订阅失效     | `ready` 失败                        | 重连；连续失败时重启并告警 | durable queue 保留积压消息          |
| Container 被停止或发布替换  | watchdog 检查实例状态               | 显式启动固定 Consumer 实例 | Consumer 幂等处理重新投递           |
| watchdog 暂时不可用         | 监控自身告警                        | 恢复 watchdog              | Consumer 默认常驻，不依赖 ping 生存 |
| 消息重复投递                | 数据库幂等键 / 已处理事件记录       | 返回成功并跳过重复副作用   | 至少一次投递不变成重复业务结果      |
| 探针仍为 200 但实例频繁重启 | `instanceId` 变化或 uptime 持续归零 | 调查崩溃原因并告警         | RabbitMQ 与幂等记录承接恢复         |

因此，`whoami` 是防御性设计中的“检测信号”，不是完整恢复机制。真正的保障来自“常驻 Consumer +
探针 + watchdog + RabbitMQ 持久消息 + 数据库幂等”这一整条恢复链。

### 为什么普通 NestJS API 不使用 `@Cron()`

`@Cron()` 的触发状态只存在于当前进程，无法成为生产关键任务的可靠调度来源：

- Container 在触发时刻休眠、重启或发布替换，任务会漏跑，恢复后不会自动回放；
- 多副本会各自运行相同 decorator，造成重复触发；
- 任务执行中进程退出时，没有天然的持久化 ack、重试或恢复语义；
- API 流量扩缩容与后台调度生命周期不同，把两者绑定会使可靠性取决于某个 API 实例是否存活；
- Redis 分布式锁只能减少同一时刻的重复执行，不能补回实例不在线时未产生的任务。

因此，文档同步、知识库重新索引、Embedding 批处理、通知、账单、归档和失败任务补偿等关键任务，
禁止直接由普通 NestJS API 的 `@Cron()` 触发。业务逻辑仍然写在 NestJS use case 中，只把生产调度
入口移到外部。

### 允许的例外

`@Cron()`、`@Interval()` 和 `@Timeout()` 仅用于：

- 不进入生产模块图的本地开发模拟或自动化测试；
- 明确允许偶尔漏跑、且不影响业务事实的非关键维护任务；
- 通过独立 ADR/OpenSpec 设计的专用 NestJS Scheduler 服务。

专用 Scheduler 仍必须具备单实例或选主、持久化调度记录、幂等键、有限重试、补偿扫描、监控告警
和故障恢复，不能只依赖进程内状态或 Redis 锁。

## RabbitMQ

RabbitMQ 是唯一的主任务和集成事件传输，不同时引入 Cloudflare Queues 或 BullMQ。

生产基线：

- 关键任务使用 durable quorum queues；
- 消息持久化并启用 publisher confirms；
- Consumer 使用 manual acknowledgement；
- 使用 per-consumer prefetch 控制并发；
- Retry Queue/Exchange 使用延迟和最大次数；
- 超出次数进入 Dead Letter Exchange/Queue，不无限立即 requeue；
- 消息采用至少一次交付语义，Consumer 必须幂等；
- 数据库变更与发消息需要原子语义时使用 transactional outbox。

消息 envelope 放在 `@repo/contracts/events`，通过 Zod 定义并版本化。消息只传 `eventId`、
`idempotencyKey`、领域标识和 R2 object key，不传 PDF 或大段正文。

## Redis

Redis 负责：

- 查询和 RAG 结果缓存；
- 分布式锁和短租约；
- 限流计数器；
- 短期 Session 或 token deny list；
- 多副本通知或 Pub/Sub；
- 可丢失、可重建的短期任务进度。

Redis 不负责业务事实，不替代 RabbitMQ，也不作为关键任务唯一的幂等存储。Key 必须有命名空间，
缓存必须明确 TTL 与失效策略；分布式锁不能替代幂等业务设计。

## NestJS 无状态约束

无状态不表示进程没有连接、缓存对象或正在执行的函数，而是任意 NestJS 实例被替换后不会丢失系统
事实。禁止把以下内容作为唯一状态来源：

- 本地文件；
- 进程内 Session；
- 进程内锁；
- 权威性的内存缓存；
- 本地任务队列；
- 某个实例独占的业务定时状态。

API 副本应当可以任意替换。Consumer 只有在持久副作用完成后才 ack；进程中断时 RabbitMQ 重新投递，
数据库幂等键阻止重复副作用。

## 本地开发

目标是用 Docker Compose 提供 RabbitMQ、Redis 和后续数据库，应用代码仍通过 pnpm 启动，以便保留
快速热更新：

```text
Docker Compose
  ├── RabbitMQ + management UI
  ├── Redis
  └── Database（选型后加入）

Host
  ├── pnpm --filter agentic-rag-business-service dev
  ├── pnpm --filter mcp-app-collections dev
  └── pnpm --filter agentic-rag-client dev
```

Compose 文件和环境变量尚未创建，接入时至少规划 `RABBITMQ_URL`、`REDIS_URL`、独立凭证和健康检查。

本地启动业务服务后可验证基础探针：

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
curl http://localhost:8080/health/whoami
```

## 为什么第一阶段不上 Kubernetes

Kubernetes 的收益包括自愈、服务发现、负载均衡、滚动发布与回滚、水平扩缩容、CronJob、Secret
管理和工作负载隔离。它在多服务、多 Consumer、队列深度驱动扩容和已有平台团队的场景中非常有
价值。

当前阶段的代价更大：集群与节点、Ingress、证书、监控、网络策略、版本升级、PersistentVolume、
备份恢复、RabbitMQ/Redis Operator 都需要持续运维。Kubernetes 能管理 StatefulSet，但不会替团队
完成数据安全、容量和灾备工作。

第一阶段使用托管 RabbitMQ 和 Redis，把持久化、故障转移、备份和升级职责交给服务提供方。达到
ADR-0009 的触发条件后，再通过独立 OpenSpec 迁移 NestJS API 和 Worker；即使迁移，也可以继续使用
托管 RabbitMQ/Redis，避免一次迁移所有状态系统。

## 后续实施顺序

1. 开通 Vercel 并创建 Next.js 项目，完成首次部署。
2. 在 Vercel 项目中添加 `ernestbot.com`；取得 Vercel 针对该项目显示的 DNS 要求后，再在
   Cloudflare DNS 中以 DNS only 模式添加对应记录。若使用 `www.ernestbot.com`，将其重定向到
   主域名。
3. 部署 Cloudflare Worker，并将 `api.ernestbot.com` 绑定为 Worker Custom Domain。
4. 配置 `NEXT_PUBLIC_API_BASE_URL=https://api.ernestbot.com`，并让 Worker 精确允许
   `https://ernestbot.com` 这一生产 Origin。
5. 用 OpenSpec 定义 RabbitMQ、Redis 和 Worker 应用的最小接入范围。
6. 增加 Docker Compose、健康检查与 `.env.example`。
7. 在 `@repo/contracts/events` 增加 Zod 消息 envelope。
8. 实现 publisher confirm、manual ack、prefetch、retry 与 DLQ。
9. 实现 transactional outbox 和数据库幂等记录。
10. 增加 Redis adapter、key namespace、TTL 和降级策略。
11. 增加指标、日志、trace ID、队列积压和 DLQ 告警。
12. 最后增加 Cloudflare Container 和生产托管服务部署配置。

## 相关决策

- [ADR-0006：Vercel 与 Cloudflare](../architecture/decisions/0006-use-vercel-and-cloudflare.md)
- [ADR-0007：RabbitMQ](../architecture/decisions/0007-use-rabbitmq.md)
- [ADR-0008：Redis](../architecture/decisions/0008-use-redis.md)
- [ADR-0009：第一阶段延后 Kubernetes](../architecture/decisions/0009-defer-kubernetes.md)
