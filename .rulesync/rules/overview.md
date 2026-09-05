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

Turborepo monorepo：`apps/agentic-rag-client`（Next.js）、`apps/agentic-rag-business-service`（NestJS）、`packages/*`。

## 编码规范

| 子工程 | 规范来源 |
| ------ | -------- |
| 前端 `apps/agentic-rag-client` | `apps/agentic-rag-client/AI_CODING_RULES.md` |
| 后端 `apps/agentic-rag-business-service` | `.agents/skills/nestjs-best-practices/SKILL.md` |
| Next.js | `.agents/skills/next-best-practices/SKILL.md` |

## OpenSpec

使用 `openspec init` 自带的标准工作流与命令（`/opsx-propose`、`/opsx-apply` 等）。配置见 `openspec/config.yaml`。
