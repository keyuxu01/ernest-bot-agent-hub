# Ernest Bot Agent

基于 pnpm 与 Turborepo 的 TypeScript monorepo，包含两个 Next.js 应用、两个 NestJS 服务以及共享配置、契约和 UI 包。

## 应用与端口

当前共有 **4 个应用**：

| 应用                           | 技术栈  | 本地开发默认端口 | 用途                     |
| ------------------------------ | ------- | ---------------: | ------------------------ |
| `agentic-rag-client`           | Next.js |           `3000` | Agentic RAG 前端         |
| `docs`                         | Next.js |           `3001` | 项目文档站点             |
| `agentic-rag-business-service` | NestJS  |           `8080` | Agentic RAG 业务服务     |
| `mcp-app-collections`          | NestJS  |           `8081` | MCP App Collections 服务 |

两个 NestJS 服务支持通过 `PORT` 环境变量覆盖默认端口。前端默认通过
`http://localhost:8080` 访问业务服务，可以使用 `API_BASE_URL` 修改接口地址。

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
│   ├── agentic-rag-business-service/   # NestJS 业务服务，端口 8080
│   │   ├── src/                         # 模块、控制器和服务
│   │   └── test/                        # e2e 测试
│   └── mcp-app-collections/             # NestJS MCP 服务，端口 8081
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

当前系统边界、协议分工和技术选型状态见
[`docs/architecture/README.md`](docs/architecture/README.md)。重要选型使用 ADR 记录，
OpenSpec 继续负责具体变更的提案、设计和实施任务。

oRPC 的启动、调用和新增接口流程见 [`docs/guides/orpc.md`](docs/guides/orpc.md)。

## 环境要求

- Node.js `>= 24`
- pnpm `11.23.0`

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

覆盖 NestJS 服务端口时，建议只启动目标服务：

```bash
PORT=9081 pnpm --filter mcp-app-collections dev
```

## oRPC 快速验证

分别启动业务服务和前端：

```bash
pnpm --filter agentic-rag-business-service dev
pnpm --filter agentic-rag-client dev
```

可访问：

- 前端：`http://localhost:3000`
- Typed greeting：`http://localhost:8080/api/greeting`
- OpenAPI JSON：`http://localhost:8080/openapi.json`
- 兼容旧接口：`http://localhost:8080/`

本项目使用稳定 oRPC v1；不要复制 v2 beta 的 `.meta(openapi(...))` 等 API。完整开发流程见
[`docs/guides/orpc.md`](docs/guides/orpc.md)。

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

| 变量           | 使用方                         | 默认值                  | 说明             |
| -------------- | ------------------------------ | ----------------------- | ---------------- |
| `API_BASE_URL` | `agentic-rag-client`           | `http://localhost:8080` | 业务服务地址     |
| `PORT`         | `agentic-rag-business-service` | `8080`                  | 业务服务监听端口 |
| `PORT`         | `mcp-app-collections`          | `8081`                  | MCP 服务监听端口 |
