---
root: true
targets: ['claudecode', 'cursor', 'codexcli', 'agentsmd']
description: 'Project rules entry'
globs: ['**/*']
cursor:
  description: 'Project rules entry'
  alwaysApply: true
---

# Project Rules

Turborepo monorepo：`apps/agentic-rag-client`（Next.js）、`apps/agentic-rag-business-service`（NestJS）、`apps/mcp-app-collections`（NestJS + MCP Widget）、`packages/*`。

## 编码规范

| 代码范围                                     | 规范来源                                        |
| -------------------------------------------- | ----------------------------------------------- |
| 前端 `apps/agentic-rag-client/**`            | `.rulesync/rules/frontend.md`                   |
| 前端组件 `packages/ui/**`                    | `.rulesync/rules/frontend.md`                   |
| MCP Widget `apps/mcp-app-collections/web/**` | `.rulesync/rules/frontend.md`                   |
| 后端 `apps/agentic-rag-business-service/**`  | `.agents/skills/nestjs-best-practices/SKILL.md` |
| MCP 后端 `apps/mcp-app-collections/src/**`   | `.agents/skills/nestjs-best-practices/SKILL.md` |
| Next.js                                      | `.agents/skills/next-best-practices/SKILL.md`   |

前端 coding 规范仅应用于表中三个前端范围，不应用于 NestJS 或 MCP Server 代码。

## OpenSpec

使用 `openspec init` 自带的标准工作流与命令（`/opsx-propose`、`/opsx-apply` 等）。配置见 `openspec/config.yaml`。

涉及框架、协议、数据库、跨应用依赖方向或其他架构边界的变更，必须同步更新
`docs/architecture/README.md`，并新增或替代对应 ADR。OpenSpec 描述一次变更的设计与实施，
ADR 记录长期有效的技术决策，两者不得互相替代。

## Agent Skills

Skills 按任务加载，不是始终生效的编码规范。项目 RuleSync rules 与 skill 冲突时，
以项目 rules 为准。

| 任务                      | Skill                                              |
| ------------------------- | -------------------------------------------------- |
| Next.js                   | `.agents/skills/next-best-practices/SKILL.md`      |
| React 性能与组合          | `.agents/skills/react-best-practices/SKILL.md`     |
| shadcn/ui                 | `.agents/skills/shadcn/SKILL.md`                   |
| NestJS                    | `.agents/skills/nestjs-best-practices/SKILL.md`    |
| Turborepo                 | `.agents/skills/turborepo/SKILL.md`                |
| Vercel AI SDK             | `.agents/skills/use-ai-sdk/SKILL.md`               |
| 新增 NestJS workspace app | `.agents/skills/setup-turbo-nest-service/SKILL.md` |
