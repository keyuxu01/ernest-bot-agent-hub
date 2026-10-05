---
name: mcp-app
description: >-
  Build and change MCP Apps / MCP UI widgets in this repository. Every widget
  must run on official MCP Apps hosts and ChatGPT. Official MCP Apps is the
  protocol baseline; ChatGPT Apps is a host variant. Use when adding a UI to an
  MCP tool, scaffolding or refactoring an MCP App, widget, MCP View, ChatGPT
  App, Apps SDK, create-mcp-app, or build-chatgpt-app work.
targets:
  - '*'
---

# MCP App

在本仓库实现 MCP App / MCP UI。**每个 widget 必须同时能在官方 MCP Apps 宿主和
ChatGPT 上运行。** 官方 MCP Apps 是协议基线；ChatGPT Apps（Apps SDK /
`window.openai`）是宿主变体，功能与官方并不完全相同，不能单独当规范。

## Load These First

按任务加载，不要只读 GPT skill。本仓库已放入官方 ext-apps skill 与 GPT skill：

| 场景 | 接着加载 |
| --- | --- |
| 本仓库约束与分流 | 本 skill（始终） |
| 给现有 `mcp-app-collections` 加 UI | `.agents/skills/add-app-to-server/SKILL.md` |
| 新 MCP App / SDK / 生命周期 | `.agents/skills/create-mcp-app/SKILL.md` |
| 把 GPT / `window.openai` / skybridge 迁到官方 | `.agents/skills/migrate-oai-app/SKILL.md` |
| 现有 Web 页面同时当 MCP App | `.agents/skills/convert-web-app/SKILL.md` |
| ChatGPT 扩展、Developer Mode、目录提交 | `.agents/skills/build-chatgpt-app/SKILL.md`，必要时再加 `chatgpt-app-submission` |

实现前读官方文档（skill 不能代替文档）：

- [Build an MCP App](https://modelcontextprotocol.io/extensions/apps/build)
- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [Patterns](https://apps.extensions.modelcontextprotocol.io/api/documents/Patterns.html)
- [SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp)
- [ext-apps](https://github.com/modelcontextprotocol/ext-apps)

双平台必读 ChatGPT 对照：
[Add UI to your MCP server](https://developers.openai.com/apps-sdk/build/chatgpt-ui)、
[MCP-UI Apps SDK](https://mcpui.dev/guide/apps-sdk)。

官方 / GPT skill 由 `rulesync.jsonc` 的 `sources` 安装到 `.rulesync/skills/.curated/`。升级用 `pnpm agent:update`，不要把官方正文拷进本地 skill 目录去改。

个人环境也可以额外安装：

```bash
npx skills add modelcontextprotocol/ext-apps
```

```text
/plugin marketplace add modelcontextprotocol/ext-apps
/plugin install mcp-apps@modelcontextprotocol-ext-apps
```

差异对照见 [official-vs-chatgpt.md](references/official-vs-chatgpt.md)。
`add-app-to-server` 是本仓库默认实现路径；`create-mcp-app` 的独立 Express 脚手架不要照抄进 monorepo。

## Protocol Baseline

每个 MCP App 是 **Tool + Resource**：

1. Tool 用 `_meta.ui.resourceUri` 指向 UI。
2. Resource 用 `ui://` URI，MIME 为 `text/html;profile=mcp-app`（或
   `@modelcontextprotocol/ext-apps` 的 `RESOURCE_MIME_TYPE`）。
3. Host 调 tool → 拉 HTML → 沙箱 iframe 渲染 → 把 tool result 推给 UI。
4. UI 通过 JSON-RPC `ui/*`（或 `App` / `useApp` 封装）和 host 通信。

官方约定：

- 服务端用 `registerAppTool` / `registerAppResource`（或本仓库 Nest 等价适配）。
- 所有 UI handler 必须在 `app.connect()` **之前**注册。
- 始终返回 `content` 文本，供不渲染 UI 的 host 使用。
- `_meta.ui.csp` / `_meta.ui.domain` 写在 resource **contents[]** 上，不要写在
  register 配置对象上。
- 无 same-origin；连 `localhost` 请求也要配 CSP。
- 数据/渲染可拆开：只有 render tool 挂 `resourceUri`。

不要为这个仓库新起独立 Express + `server.ts` 脚手架，除非用户明确要求脱离
`mcp-app-collections`。

## Dual Host Is Required

默认同时服务两个平台，不要做“只给 Claude”或“只给 ChatGPT”的实现。

| 平台 | 宿主必须看到的字段 |
| --- | --- |
| 官方 MCP Apps / Claude / basic-host | `_meta.ui.resourceUri` |
| ChatGPT / Apps SDK | `_meta["openai/outputTemplate"]` |

同一 tool 的适配层必须同时带上这两项。ChatGPT 专属文案
（`openai/toolInvocation/*`、`openai/widgetDescription`）可以一起放在适配层，
不得进领域模型。

Widget 优先写官方 `App` / `useApp` / `ui/*`。`window.openai` 只用于官方尚未覆盖
的能力（file upload、modal、checkout、`widgetState`），并且必须 feature-detect。

`@mcp-ui/server` 的 adapter **互斥**：同一个 `createUIResource` 不能同时
`mcpApps.enabled` 和 `appsSdk.enabled`。双平台时按
[Apps SDK 双 resource 模式](https://mcpui.dev/guide/apps-sdk) 拆两条 resource：

1. 官方 / MCP-UI 宿主：`createUIResource` **不**开 `appsSdk`，MIME 保持 MCP Apps。
2. ChatGPT 模板：`createUIResource` 开 `adapters.appsSdk.enabled: true`
   （会变成 `text/html+skybridge` 并注入 bridge）。

| 用官方 / 可移植写法 | 不要只写这个 |
| --- | --- |
| `_meta.ui.resourceUri` | 单独只写 `openai/outputTemplate` |
| `ui/notifications/tool-result`、`tools/call`、`ui/message` | 只走 `window.openai.*` |
| `App` / `useApp` / 原始 `postMessage` | 把 wrapper helper 教成唯一 API |
| `_meta.ui.csp` | 只写 `openai/widgetCSP` |

## This Repository

| 落点 | 位置 |
| --- | --- |
| MCP Server | `apps/mcp-app-collections/src/**` |
| Widget UI | `apps/mcp-app-collections/web/**` |
| 契约 | `@repo/contracts`，导出名 `Mcp*` |
| UI Resource 构造 | `@mcp-ui/server` 的 `createUIResource`（[mcpui.dev](https://mcpui.dev/)） |
| 可复用展示组件 | `packages/ui`；Widget 构建入口独立 |

同时遵守：

- `.rulesync/rules/mcp.md`
- `.agents/skills/nestjs-best-practices/SKILL.md` + `.rulesync/rules/backend.md`
- Widget 前端遵守 `.rulesync/rules/frontend.md`
- [ADR-0005](../../../docs/architecture/decisions/0005-evaluate-mcp-nest.md)：`@rekog/mcp-nest` v2
- [ADR-0003](../../../docs/architecture/decisions/0003-separate-ai-stream-rpc-and-mcp.md)：MCP 不是 Web 通用 API

实现约束：

- Tool / Resource handler 只做协议适配；业务规则下沉到 service / use case。
- Tool input、`structuredContent` 和共享响应用 Zod，在边界校验后再渲染。
- 禁止把未校验的模型输出拼进可执行 HTML。
- 宿主专用 `_meta` 不得泄漏到领域模型。
- 有副作用的 Tool 必须在描述里写明副作用，并保留鉴权、幂等和审计。
- 不要抄 `@rekog/mcp-nest` v1 的 `McpModule.forRoot()`。

## Workflow

1. 按双平台设计，不要先做一个宿主再补另一个。
2. 先定 tool 面：一职一 tool；描述用 “Use this when...”；标清
   `readOnlyHint` / `destructiveHint` / `openWorldHint`。
3. 非平凡 UI 用 data tool + render tool，避免每个 tool 都挂 widget 导致 iframe 重挂。
4. 在 `mcp-app-collections` 里用 `@mcp-ui/server` 构造 Resource，并同时挂官方与
   ChatGPT `_meta`。
5. Widget 放 `web/**`，优先 React + 官方 `useApp`；ChatGPT 扩展用 feature-detect。
6. 核对 CSP、文本 fallback、handler 注册顺序、契约前缀、两条 resource 是否互斥正确。
7. 两个平台都要验：
   - 官方：MCP Inspector + [basic-host](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-host)
   - Claude：HTTPS tunnel + custom connector
   - ChatGPT：Developer Mode + HTTPS `/mcp`

## Official SDK Notes

当前 `mcp-app-collections` 已直接依赖 `@mcp-ui/server`（现为 6.x，其传递依赖是
`@modelcontextprotocol/ext-apps` 0.3 与 MCP SDK 1.x）。官方 `create-mcp-app`
文档里的 ext-apps 2.x / 拆分包是上游最新线，不要在本服务里再装一套互相冲突的
SDK，除非已经做过兼容评估。

本仓库服务端以 `@rekog/mcp-nest` v2 + 官方协议为准。UI resource 用
`@mcp-ui/server` 的 `createUIResource`。ext-apps 的 `registerAppTool` /
`registerAppResource` 是语义参考，不是必须原样抄进 Nest。
字段、URI、MIME、CSP 和 UI bridge 必须同时覆盖官方 MCP Apps 与 ChatGPT。
