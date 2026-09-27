# oRPC 使用指南

本项目使用 oRPC 构建 Next.js 到 NestJS 的 contract-first 业务 API。共享 contract 和 Zod schema
提供编译期类型与运行时校验，OpenAPI 用于标准 HTTP 描述和第三方接入。

## 当前版本

| Package                                                                                   | Version   |
| ----------------------------------------------------------------------------------------- | --------- |
| `@orpc/contract`、`@orpc/client`、`@orpc/server`、`@orpc/openapi`、`@orpc/openapi-client` | `1.15.4`  |
| `@orpc/zod`                                                                               | `1.15.4`  |
| `@orpc/tanstack-query`                                                                    | `1.15.4`  |
| `@tanstack/react-query`                                                                   | `5.104.0` |
| `@orpc/nest`                                                                              | `1.15.3`  |

这些版本均来自 npm `latest`，不使用 `beta` 或 `next`。稳定 v1 与 v2 的 API、package 布局和 wire
format 不兼容：本项目使用 `.route(...)`、`@orpc/openapi-client` 和 v1 plugin 名称，不要混用 v2
示例。

## 当前调用链

```text
Next.js Server Component or browser query hook
  -> apps/agentic-rag-client/lib/api.ts
  -> apps/agentic-rag-client/lib/business-api-query.ts (browser query only)
  -> oRPC OpenAPILink + ResponseValidationPlugin
  -> GET /api/greeting
  -> NestJS BusinessApiController
  -> AppService
  -> GreetingResponseSchema validates the output
```

关键文件：

- 基础 Zod schema：`packages/contracts/src/greeting.ts`
- oRPC contract：`packages/contracts/src/orpc/business-api.ts`
- NestJS 实现：`apps/agentic-rag-business-service/src/business-api.controller.ts`
- OpenAPI 输出：`apps/agentic-rag-business-service/src/openapi.controller.ts`
- Next.js client：`apps/agentic-rag-client/lib/api.ts`
- TanStack Query utilities：`apps/agentic-rag-client/lib/business-api-query.ts`
- Browser QueryClient：`apps/agentic-rag-client/lib/query-client.ts`
- Greeting query hook：`apps/agentic-rag-client/hooks/use-greeting.ts`

`@repo/contracts` 根入口只导出基础 schema 和推导类型；oRPC contract 必须从
`@repo/contracts/orpc` 导入。这样 MCP 等普通 schema 消费方不会加载 oRPC runtime。

## 启动和调用

安装依赖：

```bash
pnpm install --frozen-lockfile
```

分别启动业务服务与前端：

```bash
pnpm --filter agentic-rag-business-service dev
pnpm --filter agentic-rag-client dev
```

验证接口：

```bash
curl http://localhost:8080/api/greeting
curl http://localhost:8080/openapi.json
curl http://localhost:8080/
```

预期 greeting 响应：

```json
{
  "message": "Hello World!"
}
```

打开 `http://localhost:3000` 可以验证 Next.js 通过 typed query client 读取结果。业务服务地址默认是
`http://localhost:8080`。Server Component 与浏览器地址可以分别覆盖：

```bash
API_BASE_URL=http://business-service.internal:8080 \
NEXT_PUBLIC_API_BASE_URL=https://api.ernestbot.com \
pnpm --filter agentic-rag-client dev
```

本地开发时两者均使用 `http://localhost:8080`。生产浏览器直接调用 Cloudflare Worker 暴露的
`api.ernestbot.com`，不通过 Next.js/Vercel rewrite；Worker 必须精确允许
`https://ernestbot.com` 的 CORS。Vercel 与 Worker 尚未开通部署时，本地继续使用 localhost 配置。

## TanStack Query 使用方式

### Query

Client Component 不直接创建 link，也不手写 query key。Hook 使用 contract-derived options：

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { businessApiQuery } from '../lib/business-api-query';

const useGreeting = () => {
  return useQuery(businessApiQuery.greeting.queryOptions());
};
```

当前 Provider 在根 layout 中为每次应用挂载创建一个 QueryClient。默认 fresh window 为 30 秒，
默认不自动 retry；确实安全的 operation 可以在自己的 query options 中覆盖策略。

Server Component 或不需要缓存的一次性流程继续使用直接调用：

```ts
import { getGreeting } from '../lib/api';

const greeting = await getGreeting();
```

### Mutation 与失效

知识库 mutation contract 接入后，使用生成的 mutation options，并用 operation key 失效相关 reads。
以下是未来 contract 的模式示例，不表示当前已经存在 `knowledge.update`：

```ts
const queryClient = useQueryClient();

const updateKnowledge = useMutation(
  businessApiQuery.knowledge.update.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: businessApiQuery.knowledge.key({ type: 'query' }),
      });
    },
  }),
);
```

禁止用 `['knowledge']` 之类手写字符串 key 替代生成 key。

### SSR Hydration（按路由启用）

当前 greeting 用于验证浏览器生命周期，不做 SSR prefetch。只有首屏 SEO、避免 loading 状态或消除
client waterfall 有明确需求的页面，才增加 `prefetchQuery`、`dehydrate` 和 `HydrationBoundary`。

若 query data 或 key 包含 `Date`、`BigInt`、`Set`、`Map` 等非 JSON 原生值，必须按照 oRPC v1
方案用 `StandardRPCJsonSerializer` 配置 QueryClient 的 `queryKeyHashFn`、`dehydrate.serializeData`
和 `hydrate.deserializeData`。同时保持非零 `staleTime`，避免 hydration 后立即重复请求。每个服务端
请求必须创建独立 QueryClient，禁止跨用户共享服务端 cache。

纯 JSON 数据的页面级流程为：

```tsx
const queryClient = createQueryClient();

await queryClient.prefetchQuery(businessApiQuery.greeting.queryOptions());

return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <Greeting />
  </HydrationBoundary>
);
```

## 新增一个业务 API

### 1. 定义基础 Schema

在 `packages/contracts/src/` 对应领域文件中定义 Zod schema，并从根 `index.ts` 显式导出。
类型必须从 schema 推导，不要重复手写相同 shape。

```ts
const KnowledgeSearchInputSchema = z.object({
  query: z.string().min(1),
});

const KnowledgeSearchOutputSchema = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string() })),
});

type KnowledgeSearchInput = z.input<typeof KnowledgeSearchInputSchema>;
type KnowledgeSearchOutput = z.output<typeof KnowledgeSearchOutputSchema>;
```

### 2. 扩展 oRPC Contract

在 `packages/contracts/src/orpc/business-api.ts` 使用稳定 v1 的 `.route(...)`：

```ts
const KnowledgeSearchContract = oc
  .route({
    method: 'GET',
    path: '/api/knowledge/search',
    summary: 'Search the knowledge base',
    tags: ['Knowledge'],
  })
  .input(KnowledgeSearchInputSchema)
  .output(KnowledgeSearchOutputSchema);

const BusinessApiContract = {
  greeting: GreetingContract,
  knowledge: {
    search: KnowledgeSearchContract,
  },
};
```

contract 只描述输入、输出、错误与 HTTP metadata，不包含数据库访问或业务逻辑。

### 3. 在 NestJS 实现 Contract

Controller 只做协议适配，并把业务处理委托给 service/use case：

```ts
@Implement(BusinessApiContract.knowledge.search)
searchKnowledge() {
  return implement(BusinessApiContract.knowledge.search).handler(({ input }) =>
    this.knowledgeService.search({ query: input.query }),
  );
}
```

将 Controller 注册到对应 NestJS module。不要在 Controller 中直接访问数据库或向量数据库。

### 4. 在 Next.js Client 暴露函数

共享 contract 更新后，`businessApiClient` 会自动获得对应方法：

```ts
const searchKnowledge = async (
  input: KnowledgeSearchInput,
): Promise<KnowledgeSearchOutput> => {
  return businessApiClient.knowledge.search(input);
};
```

React component 只调用封装后的业务函数，不直接创建 link，也不导入 NestJS 源码。
交互式 Client Component read 应优先封装成 query hook；Server Component 和无需缓存的流程可继续
直接调用封装函数。

### 5. 添加测试

至少覆盖：

- contract 接受有效输入并拒绝关键无效输入
- NestJS handler 返回 contract-valid output
- e2e 验证 method、path、状态码和响应
- `/openapi.json` 包含新增 operation
- Next.js client 成功调用、拒绝畸形响应并处理网络失败

## 验证命令

```bash
pnpm --filter @repo/contracts test
pnpm --filter @repo/contracts build
pnpm --filter agentic-rag-business-service test
pnpm --filter agentic-rag-business-service test:e2e
pnpm --filter agentic-rag-client test
pnpm lint
pnpm check-types
pnpm build
```

提交架构或协议变更时，还必须更新 `docs/architecture/README.md` 和对应 ADR，并通过 OpenSpec
记录具体设计与实施任务。

## 当前边界

- oRPC 只用于 Web 到业务服务的普通业务 API。
- TanStack Query 只管理浏览器中的普通业务 server state。
- AI streaming 保持 Vercel AI SDK/AG-UI 的原生流协议。
- Agent 的工具与资源调用保持 MCP。
- 当前 greeting 是接入 PoC；知识库 query、mutation、认证上下文和 typed business errors 尚未完成
  ADR-0004 的全部验收，因此该 ADR 仍是 Proposed。
