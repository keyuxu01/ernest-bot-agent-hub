---
root: false
targets: ['claudecode', 'cursor', 'codexcli', 'agentsmd']
description: 'MCP server and MCP App rules'
globs:
  - 'apps/mcp-app-collections/src/**/*'
  - 'apps/mcp-app-collections/test/**/*'
claudecode:
  paths:
    - 'apps/mcp-app-collections/src/**/*'
    - 'apps/mcp-app-collections/test/**/*'
cursor:
  alwaysApply: false
  description: 'MCP server and MCP App rules'
  globs:
    - 'apps/mcp-app-collections/src/**/*'
    - 'apps/mcp-app-collections/test/**/*'
---

# MCP Rules

本规范适用于 MCP Server。MCP 是 Agent 工具协议，不替代 Web 与业务服务之间的普通 HTTP/RPC API。

## Tools and Resources

- Tool 用于执行操作，Resource 用于读取上下文或 UI 资源；不得用 Resource 隐式执行副作用。
- Tool 与 Resource handler 只负责 MCP 协议适配，业务规则下沉到可测试的 service 或 use case。
- Tool input、structured content 和共享响应优先复用 `@repo/contracts` 的 Zod Schema。
- Tool 名称、描述、参数说明和错误信息必须清晰、稳定，能让 Agent 在没有额外提示的情况下正确选择。
- 有副作用的 Tool 必须在描述中明确副作用，并保留业务层的鉴权、幂等和审计能力。

## MCP UI

- MCP Widget 前端放在 `apps/mcp-app-collections/web/**`，遵守 frontend rules。
- 可复用展示组件从 `packages/ui` 获取，但 Widget 构建入口和宿主 Web 应用保持独立。
- MCP UI 返回格式、资源 URI 和宿主专用 `_meta` 只存在于 MCP 适配层，不泄漏到领域模型。
- 不把任意未经约束的模型输出直接拼接成可执行 HTML；结构化数据必须先验证再渲染。

## Errors and Verification

- 业务失败返回可操作且稳定的错误信息；内部异常不得暴露堆栈、密钥或敏感文档内容。
- 新增或修改 Tool 时测试 schema 拒绝路径、成功响应和业务错误路径。
- MCP Server 优先采用已评估的 NestJS 集成方案，并以官方 MCP SDK 与项目 ADR 为协议依据。
- 涉及 ChatGPT Apps/MCP UI 时加载 OpenAI `build-chatgpt-app` skill。
