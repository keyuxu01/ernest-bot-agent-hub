# Official MCP Apps vs ChatGPT Apps

官方 MCP Apps 是可移植协议。ChatGPT Apps / Apps SDK 跑在 MCP 上，但历史元数据、
客户端 API 和宿主扩展与官方并不相同。**本仓库每个 widget 必须同时服务两个平台。**
官方字段是基线；ChatGPT 别名和 `@mcp-ui/server` 的 Apps SDK adapter 用来补第二宿主。

## What Each One Is

| | Official MCP Apps | ChatGPT Apps |
| --- | --- | --- |
| 规范 | [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)、[SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) | OpenAI Apps SDK；ChatGPT 实现官方 bridge，另加扩展 |
| Skill | `create-mcp-app`、`add-app-to-server`、`migrate-oai-app` | `build-chatgpt-app`、`chatgpt-app-submission` |
| 文档 | [Build](https://modelcontextprotocol.io/extensions/apps/build)、[Patterns](https://apps.extensions.modelcontextprotocol.io/api/documents/Patterns.html) | [Add UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)、[MCP server](https://developers.openai.com/apps-sdk/build/mcp-server) |
| SDK | `@modelcontextprotocol/ext-apps` + [`@mcp-ui/server`](https://mcpui.dev/) | 同一套 MCP Apps bridge + `window.openai` / Apps SDK adapter |
| 典型宿主 | Claude、VS Code Copilot、basic-host、其他 MCP Apps host | ChatGPT、Codex |
| 本仓库 | 必做 | 必做，不能省略 |

## Protocol Mapping

新 UI 用中间列。右列是 ChatGPT 兼容别名或扩展，不是可移植基线。

| 目标 | 官方 MCP Apps | ChatGPT 别名 / 扩展 |
| --- | --- | --- |
| Tool 关联 UI | `_meta.ui.resourceUri` | `_meta["openai/outputTemplate"]` |
| UI MIME | `text/html;profile=mcp-app` / `RESOURCE_MIME_TYPE` | 旧示例里的 `text/html+skybridge` |
| Resource URI | `ui://...` | 同样可用；不要另造 scheme |
| 收到 tool 入参 | `ui/initialize` + `ui/notifications/tool-input`；`app.ontoolinput` | `window.openai.toolInput` |
| 收到 tool 结果 | `ui/notifications/tool-result`；`app.ontoolresult` | `window.openai.toolOutput` |
| UI 调 tool | `tools/call`；`app.callServerTool()` | `window.openai.callTool()` |
| 跟进消息 | `ui/message`；`app.sendMessage()` | `window.openai.sendFollowUpMessage()` |
| 更新模型上下文 | `ui/update-model-context`；`app.updateModelContext()` | 无完整对等物时不要用 GPT 私有通道硬套 |
| CSP | `_meta.ui.csp`（contents[]） | `openai/widgetCSP` |
| 稳定 origin | `_meta.ui.domain` | `openai/widgetDomain` |
| 边框偏好 | `_meta.ui.prefersBorder` | 同名 OpenAI 别名 |
| App-only tool | `_meta.ui.visibility: ["app"]` | 不要假设 ChatGPT 行为完全一致 |
| 调用中文案 | 无标准字段 | `openai/toolInvocation/invoking`、`invoked` |
| Widget 说明 | 无标准字段 | `openai/widgetDescription` |
| 视图状态 | `viewUUID` + localStorage / app-only tool | `window.openai.widgetState` / `setWidgetState` |
| 文件 / 模态 / 支付 | 官方未覆盖则降级 | `uploadFile`、`requestModal`、`requestCheckout` |

## Client Code

官方（可移植）：

```ts
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Example", version: "1.0.0" });
app.ontoolresult = (result) => {
  /* render result.structuredContent or text content */
};
await app.connect();
```

ChatGPT 扩展（可选，先 feature-detect）：

```ts
const openai = typeof window !== "undefined" ? window.openai : undefined;
if (openai?.requestModal) {
  await openai.requestModal({ /* ... */ });
}
```

不要对 `ChatGPT` / `Claude` 做主机名分支。官方 `App` helper 是封装，不是第三套协议；
向 GPT skill 对齐时，把它映射回 `ui/*` 或文档里的 `window.openai`。

## Server Metadata

双平台 tool `_meta`（适配层必写两项）：

```ts
_meta: {
  ui: { resourceUri: "ui://example/mcp-app.html" },
  "openai/outputTemplate": "ui://example/mcp-app-chatgpt.html",
  "openai/toolInvocation/invoking": "Loading…",
  "openai/toolInvocation/invoked": "Ready.",
}
```

用 `@mcp-ui/server` 构造 resource。同一个 `createUIResource` **不能**同时开
`mcpApps` 和 `appsSdk` adapter。双平台拆两条，见
[MCP-UI Apps SDK](https://mcpui.dev/guide/apps-sdk)：

```ts
import { createUIResource } from "@mcp-ui/server";

const officialResource = await createUIResource({
  uri: "ui://example/mcp-app.html",
  encoding: "text",
  content: { type: "rawHtml", htmlString },
});

const chatgptResource = await createUIResource({
  uri: "ui://example/mcp-app-chatgpt.html",
  encoding: "text",
  content: { type: "rawHtml", htmlString },
  adapters: { appsSdk: { enabled: true } },
});
```

`appsSdk` adapter 会把 MIME 改成 `text/html+skybridge` 并注入 `window.openai`
bridge。官方那条不要开这个 adapter。

只写 `openai/outputTemplate`、不写 `_meta.ui.resourceUri` 的旧 GPT 示例，不能用。

## Testing

| 宿主 | 怎么测 |
| --- | --- |
| 协议 / 本地 | MCP Inspector；`ext-apps/examples/basic-host`，`SERVERS='["http://localhost:9021/mcp"]'` |
| Claude | `cloudflared` / 同类 HTTPS tunnel + custom connector |
| ChatGPT | Developer Mode + 公网 HTTPS `/mcp`；GPT skill 的目录提交流程只在这个宿主需要 |

`mcp-app-collections` 默认端口是 `9021`，不要照抄官方教程的 `3001`，除非本地改过。

## Common Mix-ups

- 只做一个宿主，或把 GPT skill 当成 MCP Apps 规范。
- 用 `window.openai` 当唯一 UI 通道，导致 Claude / basic-host / 本仓库 host 空白。
- 同一个 `createUIResource` 同时开 `mcpApps` 和 `appsSdk` adapter。
- 把 `openai/*` `_meta` 传进 domain / `@repo/contracts` 业务类型。
- CSP 写在 `registerAppResource` 配置上，而不是 resource contents。
- 每个 data tool 都挂 widget，导致 ChatGPT 频繁重挂 iframe。
- 按官方教程新起 Express `server.ts`，绕开现有 Nest MCP 服务。
