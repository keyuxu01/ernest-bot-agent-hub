# `@repo/contracts`

跨 app 共享的 Zod 运行时契约与推导类型。

## 命名前缀（强制）

`Business` 与 `Platform` 是微服务命名风格，不是产品名。类型与 Schema 必须带**完整作用域**
（产品身份 + 风格），例如 `RagBusiness`、未来登录拆分为 `UserPlatform`。
禁止裸 `Business` / `Platform`，禁止无前缀通用名（如裸 `GreetingResponse`、`PingResponse`）。

| 前缀 | 产品线 / 用途 | 示例 |
|------|----------------|------|
| `RagBusiness` | Agentic RAG 业务 API | `RagBusinessGreetingResponse` |
| `Rag` | RAG 管线消息 | `RagReindexMessageV1` |
| `Mcp` | `mcp-app-collections` | `McpHelloResponse` |
| `Shared` | 跨服务基础设施 | `SharedHealthProbeResponse` |
| `UserPlatform` | 预留：登录 / 用户平台 | `UserPlatformSession` |

规则：

1. Schema 名 = `{Prefix}{Name}Schema`，类型名 = `{Prefix}{Name}`。
2. 源文件按作用域分目录：`src/rag-business/`、`src/rag/`、`src/mcp/`、`src/shared/`。
3. oRPC 同样按作用域分子目录：`src/orpc/rag-business/`；operation 名也要前缀（`RagBusinessGreetingContract`）。
4. 形状碰巧相同也不要复用无前缀名；export 必须带前缀。
5. 以后增量契约一律进对应目录，禁止再平铺到 `src/` 根下。
6. 新增产品线时先增加前缀行和目录，再导出类型。
