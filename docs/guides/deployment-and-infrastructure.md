# 部署与基础设施指南

本文记录 Know Research 第一阶段已确定的部署边界、状态归属和后续实施顺序。它描述目标架构，不表示
Vercel、Railway、RabbitMQ、Redis、数据库、DNS 或生产部署清单当前已经创建；具体接入继续通过独立
OpenSpec 变更完成。

## 第一阶段结论

| 领域               | 选择                              | 状态                          |
| ------------------ | --------------------------------- | ----------------------------- |
| Web                | Vercel 上的 Next.js               | 已选型，尚未创建项目          |
| Web 域名           | `know-research.ernestbot.com`     | 已选型，DNS 记录尚未配置      |
| API 域名           | `know-research-api.ernestbot.com` | 已选型，DNS 记录尚未配置      |
| 域名与 DNS         | `ernestbot.com` / Cloudflare DNS  | Zone 已存在，业务记录尚未配置 |
| NestJS API 运行时  | Railway 独立 Service              | 已选型，待实现与部署          |
| NestJS Consumer    | Railway 独立常驻 Service          | 已选型，待实现与部署          |
| 生产周期调度       | Railway Cron 短进程 publisher     | 已选型，待实现与部署          |
| 普通业务 API       | oRPC over HTTP                    | PoC                           |
| 消息系统           | RabbitMQ                          | 已选型，待接入                |
| 缓存与协调         | Redis                             | 已选型，待接入                |
| 数据库 / Vector DB | 尚未选择                          | 待决策                        |
| 本地基础设施       | Compose（本地使用 Podman）        | 配置已实现，待运行验收        |
| 生产 Kubernetes    | 第一阶段暂不引入                  | 已选型                        |

“已选型”只表示架构决策已经接受，不表示供应商资源已经购买、项目已经创建或生产环境已经部署。

## 当前开通状态

- `ernestbot.com` 已接入 Cloudflare，权威 DNS 由 Cloudflare 管理；
- Vercel 尚未开通，`agentic-rag-client` 项目尚未创建；
- Railway 项目、API、Consumer 和 Cron publisher Service 尚未创建；
- `know-research.ernestbot.com` 与 `know-research-api.ernestbot.com` 尚未添加 DNS 记录；
- RabbitMQ、Redis、数据库、对象存储和 Vector DB 的生产供应商尚未最终开通；
- 在 Vercel 和 Railway 分别给出实际 DNS 要求前，不预先添加猜测的 A、CNAME 或 TXT 记录。

## 域名与托管平台的关系

Cloudflare 继续管理 `ernestbot.com` 权威 DNS，但不作为当前方案的必需应用运行时或反向代理。Know
Research 使用单层业务前缀，避免一个应用占用根域名或通用 `api` 名称：

| 域名                              | DNS 管理方 | 应用托管方 | 用途                      |
| --------------------------------- | ---------- | ---------- | ------------------------- |
| `know-research.ernestbot.com`     | Cloudflare | Vercel     | Know Research Next.js Web |
| `know-research-api.ernestbot.com` | Cloudflare | Railway    | Know Research NestJS API  |

初期两个记录均使用 **DNS only（灰云）**。先在 Vercel/Railway 项目中添加自定义域名，再逐项复制平台
显示的 CNAME/TXT 值到 Cloudflare；不得凭通用教程预先填写记录。以后若需要 Cloudflare Proxy、WAF、
缓存或边缘路由，应通过单独 ADR 明确 TLS、缓存和请求策略 owner。

其他产品可继续使用 `<product>.ernestbot.com` 与 `<product>-api.ernestbot.com`，不影响 Know Research。

## 目标拓扑

```text
Cloudflare authoritative DNS
  |
  +-- know-research.ernestbot.com
  |       `--> Vercel / agentic-rag-client
  |                 |
  |                 | HTTPS / oRPC
  |                 v
  +-- know-research-api.ernestbot.com
          `--> Railway / know-research-api
                         |
                  publisher confirm
                         v
                 Managed RabbitMQ
                         |
                    manual ack
                         v
                 Railway / know-research-consumer
                 always-on / supervised

Railway / know-research-cron-<job>
  `--> publish versioned idempotent command --> RabbitMQ --> Consumer

Railway API and Consumer
  +-- Managed Redis: cache / locks / rate limits / short-lived state
  +-- Database: business facts / job records / idempotency
  +-- Object storage: source documents and large objects
  `-- Vector DB: embeddings and vector indexes
```

## Railway 服务边界

同一份 `agentic-rag-business-service` 源码按生命周期拆成不同 Railway Service：

| Service                    | 生命周期             | 是否公网 | Serverless        | 职责                                       |
| -------------------------- | -------------------- | -------- | ----------------- | ------------------------------------------ |
| `know-research-api`        | 常驻，可独立扩容     | 是       | 生产默认关闭      | HTTP/oRPC、鉴权、查询、发布命令            |
| `know-research-consumer`   | 常驻、受监督         | 否       | 必须关闭          | RabbitMQ 消费、调用 use case、持久化后 ack |
| `know-research-cron-<job>` | 到点启动，完成即退出 | 否       | 使用 Railway Cron | 只发布一次定时命令                         |

API、Consumer 和 Cron publisher 可以共享构建产物，但不得共享进程生命周期：

- API 扩容不得改变 Consumer 数量；
- API 发布不得中断 Consumer 的 AMQP 订阅；
- Consumer 空闲时仍保持可消费状态，不能依赖 HTTP 请求唤醒；
- Cron publisher 不启动 Web Server，不执行耗时业务流程；
- 每个进程处理 `SIGTERM`，停止接收新工作、关闭连接并在平台宽限期内退出。

## 跨域策略

`know-research.ernestbot.com` 与 `know-research-api.ernestbot.com` 是不同 Origin。浏览器直接访问 Railway
API，不通过 Vercel 同源代理。NestJS API 边界负责：

- 精确允许 `https://know-research.ernestbot.com`；
- Preview Origin 使用独立环境变量显式配置，不使用任意后缀通配；
- 本地开发单独允许 `http://localhost:3000`；
- 响应 `OPTIONS` 预检并返回 `Vary: Origin`；
- 只允许 API 实际需要的方法和请求头；
- 使用 Cookie 时返回精确 Origin 与 `Access-Control-Allow-Credentials: true`，禁止 `*`。

当前拓扑不包含应用层边缘代理，因此 CORS 由 NestJS/Railway 边界负责。若后续需要 WAF，另行选择前置
网关并记录新的信任边界。

## 定时任务

### 职责边界

| 职责               | 生产 Owner              | 不负责什么                   |
| ------------------ | ----------------------- | ---------------------------- |
| 何时触发           | Railway Cron            | 不执行业务流程               |
| 生成调度命令       | 短进程 NestJS publisher | 不启动 HTTP Server           |
| 可靠保存与投递命令 | RabbitMQ                | 不计算调度时间，也不启动进程 |
| 执行业务逻辑       | Railway NestJS Consumer | 不作为生产调度时钟           |
| 记录执行结果       | 数据库                  | 不依赖 Container 本地状态    |

生产链路固定为：

```text
Railway Cron
  -> 启动一次性 NestJS application context
  -> 生成 jobName + scheduledAt 对应的确定性 idempotencyKey
  -> publisher confirm 发布版本化持久消息
  -> 关闭 RabbitMQ/数据库连接并退出
  -> RabbitMQ 投递给常驻 Consumer
  -> Consumer 调用可独立测试的 use case
  -> 数据库记录任务状态与幂等结果
  -> durable side effect 完成后 manual ack
```

Railway Cron 使用 UTC，最短周期为 5 分钟，触发可能偏离精确分钟；若上一次进程仍为 Active，下一次会
被跳过。因此 Cron 进程必须设置连接和发布超时、只做快速投递并明确退出。需要小于 5 分钟、强时间精度
或持久编排的任务，必须重新选择 Scheduler/Workflow，不能退回普通 API 的 `@Cron()`。

### 为什么普通 NestJS API 不使用关键 `@Cron()`

即使 API 在 Railway 常驻，`@Cron()` 仍把调度状态绑定到某个 API 进程：

- 发布、崩溃或重启发生在触发时刻会漏跑，恢复后不会自动回放；
- 多副本会分别执行相同 decorator，产生重复触发；
- API 扩缩容与后台调度生命周期不同；
- Redis 锁只能减少同时重复，不能补回实例离线期间没有产生的任务；
- `@Cron()` 本身不提供持久 occurrence、补偿扫描、DLQ 或业务幂等。

允许例外仅包括不进入生产模块图的本地模拟、明确允许漏跑的维护任务，或通过独立 ADR/OpenSpec 设计
的专用 Scheduler Service。专用 Scheduler 仍需单实例/选主、持久 occurrence、幂等、补偿和告警。

## RabbitMQ

RabbitMQ 是唯一的主任务和集成事件传输，不同时引入 BullMQ 或其他第二套主任务系统。生产基线：

- 关键任务使用 durable quorum queues；
- 消息持久化并启用 publisher confirms；
- Consumer 使用 manual acknowledgement；
- 使用 per-consumer prefetch 控制并发；
- Retry Queue/Exchange 使用延迟和最大次数；
- 超出次数进入 Dead Letter Exchange/Queue，不无限立即 requeue；
- 消息采用至少一次交付语义，Consumer 必须幂等；
- 数据库变更与发消息需要原子语义时使用 transactional outbox。

消息 envelope 放在 `@repo/contracts/events`，通过 Zod 定义并版本化。消息只传 `eventId`、
`idempotencyKey`、领域标识和对象存储 key，不传 PDF 或大段正文。

生产 RabbitMQ 必须具备明确的持久化、备份、恢复和升级 owner。Railway Catalog/Template 只能简化创建，
不能自动等同于托管服务；若第一阶段为降低成本采用自管实例，必须另行记录可接受的停机与恢复目标。

## Redis

Redis 负责：

- 查询和 RAG 结果缓存；
- 分布式锁和短租约；
- 限流计数器；
- 短期 Session 或 token deny list；
- 多副本通知或 Pub/Sub；
- 可丢失、可重建的短期任务进度。

Redis 不负责业务事实，不替代 RabbitMQ，也不作为关键任务唯一的幂等存储。Key 必须有命名空间，缓存
必须有 TTL 与失效策略；分布式锁不能替代幂等业务设计。

## 健康检查、重启与监控

API 与 Consumer 分别提供以下探针语义：

| Endpoint         | 用途        | 判断内容                                                        |
| ---------------- | ----------- | --------------------------------------------------------------- |
| `/health/live`   | Liveness    | 当前 NestJS 进程能够响应；不等待外部依赖                        |
| `/health/ready`  | Readiness   | 当前实例是否可以接活；Consumer 必须检查 RabbitMQ 连接和订阅状态 |
| `/health/whoami` | Instance ID | 非敏感服务名、实例/部署标识、版本和 uptime                      |

`whoami` 不能代替 readiness。当前 PoC 尚未接入 RabbitMQ、Redis 和数据库，因此 `/health/ready` 暂时
只表示 NestJS 完成启动；每项生产依赖接入时必须补充相应 indicator。

Railway deployment healthcheck 用于新版本切流前验证，并不等同于上线后的持续监控。Consumer 配置
Restart Policy、禁止 Serverless，并由独立监控持续检查 liveness/readiness、队列积压、重连、DLQ 和
任务失败。RabbitMQ 保存未 ack 消息，平台重启恢复计算进程，两者职责不能混淆。

## Railway 与 Turborepo

### 构建根目录与命令

这是共享 pnpm workspace，`agentic-rag-business-service` 依赖 `@repo/contracts`。Railway API、Consumer
和 Cron publisher 都从仓库根目录 `/` 构建，不能把 Root Directory 设为应用子目录。初始命令：

```text
Build: pnpm turbo run build --filter=agentic-rag-business-service
API:   pnpm --filter agentic-rag-business-service start:prod
Worker/Cron: 在对应实现变更中增加独立 package scripts
```

### Watch Paths

Railway 的 Watch Paths 是显式路径规则，不是完整 Turbo dependency graph。后端 Service 初始至少监听：

```text
/apps/agentic-rag-business-service/**
/packages/contracts/**
/packages/typescript-config/**
/package.json
/pnpm-lock.yaml
/pnpm-workspace.yaml
/turbo.json
```

修改业务应用或共享 Contract 都必须触发相关后端部署；纯前端文件变化可以跳过后端。只有证明一个路径
不影响构建后才能继续缩小列表。

### 构建缓存

Railpack 默认提供构建层缓存，但缓存命中不保证。可选地给 Railway Build 配置作用域受限的
`TURBO_TOKEN` 与 `TURBO_TEAM`，让 API、Consumer、Cron 和外部 CI 共享 Vercel Remote Cache。

启用 Remote Cache 前必须审计环境变量：

- `NEXT_PUBLIC_API_BASE_URL` 会进入浏览器构建，必须参与 `build` task hash；
- Railway `PORT` 仅在运行时读取，可以 pass-through 而不影响 hash；
- `POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 和 `MONGO_URI`
  仅在业务服务运行时读取，可以 pass-through；生产凭据必须由 Railway variables 或 secret manager
  注入，不能使用仓库中的本地示例值；
- `SNOWFLAKE_WORKER_ID` 与 `SNOWFLAKE_OFFSET` 仅在业务服务运行时读取，可以 pass-through；每个并发
  ID 生成实例必须使用唯一的 worker ID，已产生持久化 ID 后不得修改 offset；
- `API_BASE_URL` 是否参与 hash 取决于最终 Next.js 构建/运行时读取方式，验证前不能跨不同值承诺复用。

当前 `turbo.json` 把这些变量放在 `globalPassThroughEnv`，后续启用 Remote Cache 的实施变更必须先把
构建期公开变量移入 `globalEnv` 或对应 `build.env`。未来若使用多阶段 Dockerfile，可通过
`turbo prune agentic-rag-business-service --docker` 缩小安装和构建范围；本次文档变更不创建 Dockerfile。

## 本地开发

本地使用 Podman Compose 提供共享基础设施，应用代码仍通过 pnpm 启动以保留热更新。`docker-compose.yml` 保持 Compose 规范兼容，不依赖 Podman 专属语法：

```text
Podman Compose
  +-- PostgreSQL + pgAdmin
  +-- MongoDB + mongo-express
  +-- Redis + RedisInsight
  +-- RabbitMQ
  +-- Elasticsearch + Kibana
  +-- RustFS
  `-- Neo4j

Host
  +-- pnpm --filter agentic-rag-business-service dev
  +-- pnpm --filter mcp-app-collections dev
  `-- pnpm --filter agentic-rag-client dev
```

仓库已提供 `.env.dev`、`.env.example`、`.env.prod.example`、健康检查和持久化目录。`podman compose config` 的静态解析已通过；尚未完成全部容器启动、健康状态、端口和数据读写验收。应用侧的 `RABBITMQ_URL`、`REDIS_URL`、数据库 URL 与独立凭证仍需在具体功能接入时配置。

## 为什么第一阶段不上 Kubernetes

Kubernetes 能提供自愈、服务发现、滚动发布、水平扩缩容、CronJob、Secret 和工作负载隔离，但当前
服务数量不足以抵消集群、Ingress、存储、监控、网络策略和升级成本。第一阶段使用 Vercel/Railway
承载应用进程并使用托管状态服务；达到 ADR-0009 的触发条件后，再迁移无状态 API/Consumer，状态服务
仍可保持外部托管。

## 后续实施顺序

1. 开通 Vercel 并创建 `agentic-rag-client` 项目，确认生产构建通过。
2. 在 Vercel 添加 `know-research.ernestbot.com`，取得项目实际 DNS 要求后，在 Cloudflare 添加 DNS-only
   记录。
3. 用独立 OpenSpec 实现 NestJS 生产 CORS、RabbitMQ publisher/Consumer、Redis adapter、数据库任务
   记录、健康检查与 graceful shutdown。
4. 为 `agentic-rag-business-service` 增加 API、Consumer、Cron publisher 独立入口和 package scripts。
5. 创建 Railway 项目与 `know-research-api`、`know-research-consumer` Service；从 monorepo 根目录构建，
   配置 Turbo filter、Watch Paths、资源限制、Restart Policy 和 Serverless 策略。
6. 开通具备持久化/备份/恢复 owner 的 RabbitMQ、Redis 和数据库，并通过环境引用/Secret 接入；不得把
   生产凭据写入仓库。
7. 在 Railway API 添加 `know-research-api.ernestbot.com`，取得 Railway 实际 CNAME/TXT 后再配置
   Cloudflare DNS-only 记录。
8. 部署常驻 Consumer，验证断连重连、manual ack、prefetch、retry、DLQ、幂等与恢复流程。
9. 为每个周期任务创建 Railway Cron publisher，验证成功发布后进程退出、失败返回非零状态，并增加
   occurrence/补偿扫描与告警。
10. 若启用 Vercel Remote Cache，先修正构建期环境变量 hash，再验证 API/Consumer 跨 Service cache hit
    不会复用错误环境产物。
11. 增加外部 uptime、readiness、队列积压、DLQ、任务失败与费用告警。

## 相关决策

- [ADR-0007：RabbitMQ](../architecture/decisions/0007-use-rabbitmq.md)
- [ADR-0008：Redis](../architecture/decisions/0008-use-redis.md)
- [ADR-0009：第一阶段延后 Kubernetes](../architecture/decisions/0009-defer-kubernetes.md)
- [ADR-0011：Vercel Web 与 Railway 后端运行时](../architecture/decisions/0011-use-vercel-and-railway.md)
