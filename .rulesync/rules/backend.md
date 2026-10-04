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
- 业务服务的 feature module 统一位于 `src/modules/<feature>`；数据库连接等技术设施位于
  `src/infrastructure/<capability>`。根 `AppModule` 只负责组合模块，不直接注册业务 Controller 或 Service。
- 模块间使用指向具体文件的相对导入；不要新增 `modules/index.ts` 等 barrel 入口来隐藏依赖关系。
- Controller 与协议 handler 只负责输入输出适配、鉴权上下文接入和调用业务服务。
- 业务规则放在 service 或 use case；禁止在 Controller、MCP Tool 或 DTO 中实现业务规则。
- 数据访问必须经过明确的数据访问抽象：Service / use case 通过 feature 内 Repository（或等价
  数据访问层）访问数据库；禁止在 Controller、Service 中直接注入 `EntityManager`、TypeORM
  `Repository` 或 Mongoose `Model`。
- 跨应用数据模型从 `@repo/contracts` 获取，不在应用内复制 Schema 或类型。

## Code Style

### Feature 内目录

feature 根目录只放 `*.module.ts`、`*.controller.ts`、`*.service.ts`（及协议 handler 等入口）。
其余按职责进子目录，例如：

```text
src/modules/<feature>/
  *.module.ts
  *.controller.ts
  *.service.ts
  repository/     # 自定义数据访问（*Repository）
  entities/       # TypeORM Entity
  schemas/        # Mongoose Schema
  dto/            # 入参校验 DTO
  type/           # 独立 type / interface
  helpers/        # 模块内纯函数
```

禁止新建全局 `src/repositories/`、`src/services/` 等按技术层横切的目录。

### Types

- feature 内的独立 `type` / `interface`（入参、查询结果、Repository 输入等）统一放在
  `src/modules/<feature>/type/`，按用途分文件，例如 `create-document-meta.input.ts`。
- 禁止把可复用的 type 长期堆在 `*.service.ts` / `*.repository.ts` 顶部；需要导出的类型从
  `type/` 导入。
- Entity / Schema 类本身留在 `entities/`、`schemas/`；与 ORM 类紧耦合的别名（如
  `HydratedDocument<T>`）可留在 schema 旁，其余独立类型仍进 `type/`。
- 跨应用共享类型继续走 `@repo/contracts`，不要复制进模块 `type/`。

### Repository

- 自定义数据访问类（`*Repository`）放在 `src/modules/<feature>/repository/`，不要长期堆在
  feature 根目录。
- Service / use case 通过这些 Repository 访问数据库；禁止在 Controller、Service 中直接注入
  `EntityManager`、TypeORM `Repository` 或 Mongoose `Model`（与 Architecture 节一致）。

### Helpers vs Utils

- 不必要写成 class / `@Injectable()` 的纯函数，先判断作用域再落位：
  - **仅当前 feature 使用**：放 `src/modules/<feature>/helpers/`（如文档字数、正文摘要截取）。
  - **跨 feature / 应用级复用**：先查 `src/common/helpers/`（或已有 `utils/`）；已有则复用，
    没有且确实通用再新增到公共目录，不要为了「看起来公共」提前上提。
- Service 只编排业务流程；可单测、无 DI 依赖的算法与格式化逻辑优先抽成 helper 函数。

### Comments

- 模块、Repository、关键业务流程使用中文 JSDoc：写清职责、关联键、边界（软删 / 回滚 /
  双写顺序等），而不是复述代码字面含义。
- 行内注释只补充非显而易见的约束（例如 `status === 0` 也要用 `!== undefined` 判断）。

## Runtime and Errors

- NestJS 应用保持 CommonJS package boundary，并使用 TypeScript `NodeNext` 模块解析；源码中的内部相对
  导入省略文件扩展名。运行时最低 Node.js 版本为 24，以支持从 CommonJS 同步加载所需的 ESM-only 依赖。
- 共享运行时包必须通过 `dist` 暴露编译产物和声明文件；不得让生产 Node.js 进程依赖工作区 TypeScript
  源码或仅靠消费者 bundler 才能解析的入口。
- 外部输入和输出必须在边界进行运行时校验。
- 业务错误必须映射为稳定错误码；不要把内部异常、堆栈或敏感信息直接返回给客户端。
- catch 异常时记录必要上下文，但不得记录凭据、完整文档内容或其他敏感数据。

## Scheduling and Background Jobs

- 普通 NestJS API 与 RabbitMQ Consumer 进程不得作为生产关键任务的 scheduler of record。禁止直接用
  `@Cron()`、`@Interval()` 或 `@Timeout()` 触发文档同步、知识库重建、Embedding、通知、账单、归档或
  失败任务补偿。
- 生产周期调度默认由 Railway Cron 启动短进程 publisher；publisher 只创建 application context、生成
  确定性幂等键、通过 publisher confirm 发布版本化 RabbitMQ 命令、关闭资源并退出。若 Railway Cron
  的最短周期或时间保证不满足需求，必须通过 ADR/OpenSpec 明确选择其他外部调度器；NestJS Consumer
  调用可独立测试的 use case 执行业务逻辑。
- 定时入口、消息投递与业务执行必须分层。禁止把完整业务流程写在 decorator method、Worker handler
  或消息 handler 中。
- 所有关键后台任务必须具有持久化任务记录、幂等键、有限重试、DLQ、补偿扫描和可观测性。Redis
  分布式锁只能减少并发重复，不能恢复进程停止、重启或漏掉的触发，因此不能单独作为可靠性方案。
- RabbitMQ 会保留持久化的未消费消息，但不会因队列出现消息而启动已停止或休眠的进程。关键 Consumer
  默认作为独立 Railway Service 运行，必须关闭 Serverless、不会缩容到零、配置自动重启和持续监控；
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
