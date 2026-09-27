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

## Verification

- 修改 NestJS 应用后至少运行对应 lint、type-check、unit test 和 build。
- 修改路由、协议或启动配置后运行 e2e test。
- 修改 workspace 依赖或构建任务后，再运行根 Turbo lint、check-types 和 build。
