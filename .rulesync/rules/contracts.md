---
root: false
targets: ['claudecode', 'cursor', 'codexcli', 'agentsmd']
description: 'Shared runtime contract rules'
globs:
  - 'packages/contracts/**/*'
claudecode:
  paths:
    - 'packages/contracts/**/*'
cursor:
  alwaysApply: false
  description: 'Shared runtime contract rules'
  globs:
    - 'packages/contracts/**/*'
---

# Shared Contract Rules

本规范适用于 `packages/contracts/**`。该包是跨应用 HTTP、RPC、MCP 数据边界的
Zod 运行时契约唯一真相源。

## Domain Prefixes

`Business` 与 `Platform` 是微服务命名风格，不是产品名。前缀必须是**完整作用域**
（产品身份 + 风格），例如 `RagBusiness`、未来登录拆分为 `UserPlatform`。
禁止裸 `Business` / `Platform`，禁止无前缀通用名（如裸 `GreetingResponse`、
`PingResponse`、`HealthProbeResponse`）。新增产品线时先在本表增加前缀行和目录，再导出类型。

| 前缀 | 产品线 / 用途 | 示例 |
| ---- | ------------- | ---- |
| `RagBusiness` | Agentic RAG 业务 API（`agentic-rag-business-service` / client） | `RagBusinessGreetingResponse` |
| `Rag` | RAG 管线消息与领域载荷 | `RagReindexMessageV1` |
| `Mcp` | `mcp-app-collections` 对外载荷 | `McpHelloResponse` |
| `Shared` | 跨服务基础设施（health 等） | `SharedHealthProbeResponse` |
| `UserPlatform` | 预留：登录 / 用户平台微服务 | `UserPlatformSession` |

- Schema 名 = `{Prefix}{Name}Schema`，类型名 = `{Prefix}{Name}`。
- 源文件按作用域分目录：`src/rag-business/`、`src/rag/`、`src/mcp/`、`src/shared/`。
- `src/orpc/` 按同一作用域再分子目录（如 `src/orpc/rag-business/`）；operation 与 router 导出名也必须带前缀（如 `RagBusinessGreetingContract`）。
- 形状碰巧相同也不要导出无前缀名；可复制 schema 或抽私有 `z.object`，但 **export 必须带前缀**。
- 新增契约（含 oRPC）一律落进对应作用域目录并带前缀，禁止再往 `src/` 根目录平铺。

## Schema and Type

- 每个公共边界模型必须提供具名 Zod Schema 以及从 Schema 推导的类型。
- 禁止为同一数据结构额外手写 `interface` 或重复的 type shape。
- 没有 transform 的输出类型使用 `z.output<typeof Schema>`。
- 存在 preprocess、coerce、default 或 transform 时，必须按实际需要分别导出
  `z.input<typeof Schema>` 和 `z.output<typeof Schema>`，并使用清晰的 Input、Output、DTO 或 UTO 命名。
- Schema 负责数据形状和边界校验，不包含数据库访问、网络请求或应用业务逻辑。

## Exports and Dependencies

- 只允许具名、显式导出，禁止 `export *`。
- `index.ts` 只负责显式重导出，不得包含实现或副作用。
- `packages/contracts` 禁止依赖任何 `apps/*` 或 `packages/ui`。
- Zod 必须是直接 runtime dependency，不得依赖 workspace hoisting。
- 公共运行时入口从编译后的 `dist` 提供；不得添加 TypeScript 源码 fallback 掩盖缺失构建。

## Boundary Usage

- HTTP、RPC、MCP 与表单等不可信输入必须在进入可信业务层前执行运行时校验。
- 已验证的数据在内部流转时不重复 parse，除非进入新的信任边界。
- MCP 与普通 API 优先复用底层 Schema，不复制字段定义；跨域复用时仍各自导出带前缀的公共名。

## Verification

- 每个公共 Schema 至少覆盖有效输入和关键无效输入测试。
- 修改公共契约时必须验证 `@repo/contracts` 及所有受影响消费者的 lint、type-check、test 和 build。
- 修改包导出或编译策略时必须执行根 Turbo build，确认 Next.js 与 NestJS 均能解析运行时入口。
