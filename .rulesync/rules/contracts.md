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
- MCP 与普通 API 优先复用底层 Schema，不复制字段定义。

## Verification

- 每个公共 Schema 至少覆盖有效输入和关键无效输入测试。
- 修改公共契约时必须验证 `@repo/contracts` 及所有受影响消费者的 lint、type-check、test 和 build。
- 修改包导出或编译策略时必须执行根 Turbo build，确认 Next.js 与 NestJS 均能解析运行时入口。
