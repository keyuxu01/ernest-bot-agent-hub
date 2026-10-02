# Ernest Bot Agent

基于 pnpm 与 Turborepo 的 TypeScript monorepo，包含两个 Next.js 应用、两个 NestJS 服务以及共享配置、契约和 UI 包。

## 应用与端口

当前共有 **4 个应用**：

| 应用                           | 技术栈  | 本地开发默认端口 | 用途                     |
| ------------------------------ | ------- | ---------------: | ------------------------ |
| `agentic-rag-client`           | Next.js |           `3000` | Agentic RAG 前端         |
| `docs`                         | Next.js |           `3001` | 项目文档站点             |
| `agentic-rag-business-service` | NestJS  |           `9020` | Agentic RAG 业务服务     |
| `mcp-app-collections`          | NestJS  |           `9021` | MCP App Collections 服务 |

两个 NestJS 服务支持通过 `PORT` 环境变量覆盖默认端口。前端默认通过
`http://localhost:9020` 访问业务服务；Server Component 可使用 `API_BASE_URL`，浏览器 query
使用 `NEXT_PUBLIC_API_BASE_URL`。浏览器直接请求业务 API Origin，不经过 Vercel 同源代理。

两个 NestJS 服务以 CommonJS 产物运行，但使用 TypeScript `NodeNext` 解析，并要求 Node.js 24 或
更高版本，以同步加载 oRPC 等 ESM-only 依赖。共享 `@repo/contracts` 由 Turbo 先行构建，所有运行时
入口都指向 `dist`；详见 [ADR-0012](docs/architecture/decisions/0012-use-commonjs-nestjs.md)。

## 项目结构

```text
.
├── apps/
│   ├── agentic-rag-client/             # Next.js 前端，端口 3000
│   │   ├── app/                         # App Router 页面与样式
│   │   ├── lib/                         # API 客户端等公共逻辑
│   │   └── public/                      # 静态资源
│   ├── docs/                            # Next.js 文档站点，端口 3001
│   │   ├── app/
│   │   └── public/
│   ├── agentic-rag-business-service/   # NestJS 业务服务，端口 9020
│   │   ├── src/                         # 模块、控制器和服务
│   │   └── test/                        # e2e 测试
│   └── mcp-app-collections/             # NestJS MCP 服务，端口 9021
│       ├── src/                         # 模块、控制器和服务
│       └── test/                        # e2e 测试
├── packages/
│   ├── eslint-config/                   # 共享 ESLint 配置
│   ├── contracts/                       # Zod 运行时契约及推导类型
│   │   └── src/orpc/                    # 独立的 oRPC contract 入口
│   ├── typescript-config/               # 共享 TypeScript 配置
│   └── ui/                              # 共享 React UI 组件
├── turbo.json                           # Turbo 任务与缓存配置
├── pnpm-workspace.yaml                  # pnpm workspace 配置
└── package.json                         # 根任务和工具版本
```

`dist/`、`.next/` 和 `.turbo/` 是构建或缓存目录，不属于源码结构。

## 架构与技术决策

产品定位、目标能力、输入材料与当前实现的差异见
[`docs/guides/product-overview.md`](docs/guides/product-overview.md)。该文档将 RAG 产品蓝图与
仓库当前状态分开描述，避免把候选技术或规划能力误写成已完成实现。

当前系统边界、协议分工和技术选型状态见
[`docs/architecture/README.md`](docs/architecture/README.md)。重要选型使用 ADR 记录，
OpenSpec 继续负责具体变更的提案、设计和实施任务。

oRPC 的启动、调用和新增接口流程见 [`docs/guides/orpc.md`](docs/guides/orpc.md)。
部署边界、RabbitMQ、Redis、Docker Compose 规划、NestJS 无状态约束及 Kubernetes 演进条件见
[`docs/guides/deployment-and-infrastructure.md`](docs/guides/deployment-and-infrastructure.md)。

## 环境要求

- Node.js `>= 24`
- pnpm `11.23.0`
- Podman `6.x` 与可用的 `podman compose` provider

## 安装依赖

```bash
pnpm install
```

## 开发前同步 Agent 配置

本仓库使用 RuleSync 统一维护 `.rulesync/rules` 和 `.rulesync/skills`。首次开发或拉取这些目录的
更新后，请允许 RuleSync 写入本地 Agent 配置目录，并执行：

| 命令                | 用途                                                         |
| ------------------- | ------------------------------------------------------------ |
| `pnpm agent:sync`   | 根据 `rulesync.lock` 安装固定版本的 Skills 并生成 Agent 配置 |
| `pnpm agent:update` | 主动升级远程 Skills、更新 lock 并重新生成                    |
| `pnpm agent:check`  | 在 CI 或提交前检查生成结果是否与 RuleSync 源文件一致         |

首次开发先执行 `pnpm agent:sync`。生成文件已加入 `.gitignore`，不得手工修改；需要调整时只修改
`.rulesync` 源文件。

## 本地开发

首次在 macOS 上使用 Podman 时，先确保 Podman machine 已启动：

```bash
podman machine start
```

启动本地基础设施：

```bash
pnpm docker:up
pnpm docker:ps
```

`docker:*` 是为了保留已有脚本名称；本地脚本调用 `podman compose`，prod 脚本保留 `docker compose`。完整服务、端口、环境文件和持久化说明见 [`docker-compose.yml`](docker-compose.yml) 与 [`.env.example`](.env.example)。

Compose **只起基础设施**，不占用应用默认端口；与 `pnpm dev` 同机并存时，注意下表（宿主机端口）：

| 用途                          | 端口                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| Next.js 前端                  | `3000`                                                      |
| 业务 Nest                     | `9020`（9xxx，避开下方 RustFS）                             |
| MCP Nest                      | `9021`                                                      |
| RustFS（Compose，API/控制台） | `9000` / `9001`                                             |
| mongo-express（Compose）      | `8081`                                                      |
| pgAdmin                       | `8088`                                                      |
| Postgres / Mongo / Redis / …  | `5432` / `27017` / `6379` 等（见 `.env.example`）           |

常用运维命令：

```bash
pnpm docker:logs
pnpm docker:down
```

同时启动所有应用：

```bash
pnpm dev
```

启动单个应用：

```bash
pnpm --filter agentic-rag-client dev
pnpm --filter docs dev
pnpm --filter agentic-rag-business-service dev
pnpm --filter mcp-app-collections dev
```

若本机某端口已被占用，可单独改 `PORT` 再启动对应 Nest 应用，例如：

```bash
PORT=9011 pnpm --filter mcp-app-collections dev
```

## oRPC 快速验证

分别启动业务服务和前端：

```bash
pnpm --filter agentic-rag-business-service dev
pnpm --filter agentic-rag-client dev
```

可访问：

- 前端：`http://localhost:3000`
- Typed greeting：`http://localhost:9020/api/greeting`
- OpenAPI JSON：`http://localhost:9020/openapi.json`
- 兼容旧接口：`http://localhost:9020/`

本项目使用稳定 oRPC v1；不要复制 v2 beta 的 `.meta(openapi(...))` 等 API。完整开发流程见
[`docs/guides/orpc.md`](docs/guides/orpc.md)。

交互式业务数据使用 `@orpc/tanstack-query` 生成 query options 和 keys，再由 TanStack Query 管理
pending、error、缓存与失效。Server Component 和一次性 imperative 流程仍可直接调用 oRPC client；
AI streaming 与 MCP 不进入普通 Query cache。

## 构建与检查

```bash
pnpm build
pnpm lint
pnpm check-types
```

运行 NestJS 服务测试：

```bash
pnpm --filter agentic-rag-business-service test
pnpm --filter agentic-rag-business-service test:e2e
pnpm --filter mcp-app-collections test
pnpm --filter mcp-app-collections test:e2e
```

## 环境变量

需要环境变量的应用在对应目录中提供 `.env.example`。常用变量如下：

| 变量                       | 使用方                         | 默认值                  | 说明                          |
| -------------------------- | ------------------------------ | ----------------------- | ----------------------------- |
| `API_BASE_URL`             | `agentic-rag-client` server    | `http://localhost:9020` | Server Component 业务地址     |
| `NEXT_PUBLIC_API_BASE_URL` | `agentic-rag-client` browser   | `http://localhost:9020` | 浏览器可见的公开 API Origin   |
| `PORT`                     | `agentic-rag-business-service` | `9020`                  | 业务服务监听端口              |
| `PORT`                     | `mcp-app-collections`          | `9021`                  | MCP 服务监听端口              |
| `POSTGRES_HOST`            | `agentic-rag-business-service` | `localhost`             | PostgreSQL 主机               |
| `POSTGRES_PORT`            | `agentic-rag-business-service` | `5432`                  | PostgreSQL 端口               |
| `POSTGRES_USER`            | `agentic-rag-business-service` | `user`                  | PostgreSQL 应用账号           |
| `POSTGRES_PASSWORD`        | `agentic-rag-business-service` | `123456`                | PostgreSQL 密码（仅本地示例） |
| `POSTGRES_DB`              | `agentic-rag-business-service` | `agent_hub`             | PostgreSQL 数据库             |
| `MONGO_URI`                | `agentic-rag-business-service` | 见应用 `.env.example`   | MongoDB 应用连接 URI          |
| `SNOWFLAKE_WORKER_ID`      | `agentic-rag-business-service` | `1`                     | 并发实例唯一，范围 `1–1022`   |
| `SNOWFLAKE_OFFSET`         | `agentic-rag-business-service` | `1704067200000`         | 固定的自定义纪元毫秒值        |
