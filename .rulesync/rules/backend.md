---
root: false
targets: ['claudecode', 'cursor', 'codexcli', 'agentsmd']
description: 'NestJS backend project rules'
globs:
  - 'apps/agentic-rag-business-service/**/*'
  - 'apps/mcp-app-collections/src/**/*'
  - 'apps/mcp-app-collections/test/**/*'
claudecode:
  paths:
    - 'apps/agentic-rag-business-service/**/*'
    - 'apps/mcp-app-collections/src/**/*'
    - 'apps/mcp-app-collections/test/**/*'
cursor:
  alwaysApply: false
  description: 'NestJS backend project rules'
  globs:
    - 'apps/agentic-rag-business-service/**/*'
    - 'apps/mcp-app-collections/src/**/*'
    - 'apps/mcp-app-collections/test/**/*'
---

# NestJS Backend Rules

本规范补充 `.agents/skills/nestjs-best-practices/SKILL.md`，只记录当前仓库特有约束。

## Architecture

- 按业务 feature module 组织代码，禁止新增按 controller/service/repository 横向聚合的全局目录。
- Controller 与协议 handler 只负责输入输出适配、鉴权上下文接入和调用业务服务。
- 业务规则放在 service 或 use case；禁止在 Controller、MCP Tool 或 DTO 中实现业务规则。
- 数据访问必须经过明确的数据访问抽象；Controller 不得直接操作数据库或向量数据库。
- 跨应用数据模型从 `@repo/contracts` 获取，不在应用内复制 Schema 或类型。

## Runtime and Errors

- 保持 ESM 与 NodeNext 兼容，内部相对导入使用能够在编译后 Node.js 中解析的 `.js` specifier。
- 外部输入和输出必须在边界进行运行时校验。
- 业务错误必须映射为稳定错误码；不要把内部异常、堆栈或敏感信息直接返回给客户端。
- catch 异常时记录必要上下文，但不得记录凭据、完整文档内容或其他敏感数据。

## Scheduling and Background Jobs

- 普通 NestJS API 与 RabbitMQ Consumer 进程不得作为生产关键任务的 scheduler of record。禁止直接用
  `@Cron()`、`@Interval()` 或 `@Timeout()` 触发文档同步、知识库重建、Embedding、通知、账单、归档或
  失败任务补偿。
- 生产周期调度由 Cloudflare Cron Trigger 或已明确选定的外部调度器触发；触发器只发布版本化命令到
  RabbitMQ，NestJS Consumer 调用可独立测试的 use case 执行业务逻辑。
- 定时入口、消息投递与业务执行必须分层。禁止把完整业务流程写在 decorator method、Worker handler
  或消息 handler 中。
- 所有关键后台任务必须具有持久化任务记录、幂等键、有限重试、DLQ、补偿扫描和可观测性。Redis
  分布式锁只能减少并发重复，不能恢复 Container 休眠或重启期间漏掉的触发，因此不能单独作为可靠性
  方案。
- RabbitMQ 会保留持久化的未消费消息，但不会因队列出现消息而启动已停止或休眠的 Container。关键
  Consumer 必须运行在不会缩容到零且能自动重启的受监督运行时，或者具备显式启动与周期性 watchdog；
  不得假设“有消息就会自动唤醒 Consumer”。
- 常驻 Consumer 必须提供独立的 liveness、readiness 和 instance identity 探针。Liveness 只判断进程
  是否存活；readiness 必须覆盖 RabbitMQ 连接和 Consumer 注册状态；identity 只返回非敏感实例标识，
  不得代替 readiness。外部 watchdog 必须负责探测失败后的显式启动、重启与告警。
- `@Cron()` 仅允许用于不进入生产模块图的本地模拟、测试，或明确允许漏跑的非关键维护任务。若确需
  NestJS Scheduler，必须作为独立部署单元，并在对应 ADR/OpenSpec 中说明单实例/选主、持久化调度
  状态、幂等、补偿与故障恢复方案；不得只依赖进程内状态或 Redis 锁。

## Verification

- 修改 NestJS 应用后至少运行对应 lint、type-check、unit test 和 build。
- 修改路由、协议或启动配置后运行 e2e test。
- 修改 workspace 依赖或构建任务后，再运行根 Turbo lint、check-types 和 build。
