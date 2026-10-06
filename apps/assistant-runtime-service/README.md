# assistant-runtime-service

NestJS **助手 Agent Runtime**：会话编排、模型调用与 MCP 工具挂载的后端（脚手架阶段）。

与 `agentic-rag-business-service` 并行，**不是** Agentic RAG 业务服务。公共 Tool 抽象复用
`mcp-app-collections`。开发和测试直接连接 `http://localhost:9021`；生产及远程地址必须使用 HTTPS。

## Development

From the repository root:

```bash
pnpm --filter assistant-runtime-service dev
```

Default port: `9030` (`PORT` overrides).

| Endpoint                        | Purpose                             |
| ------------------------------- | ----------------------------------- |
| `GET /health/live`              | Liveness                            |
| `GET /health/ready`             | Readiness (no deps yet)             |
| `GET /health/whoami`            | Service identity                    |
| `GET /assistant/ping`           | Runtime ping (+ configured MCP URL) |
| `GET /assistant/stream?prompt=` | SSE stub stream for CLI             |

See `.env.example` for environment variables.
