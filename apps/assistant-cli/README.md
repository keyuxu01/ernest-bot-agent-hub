# assistant-cli

本地控制台客户端。开发时直接通过 `http://localhost:9030` 连接
`assistant-runtime-service`，不需要本地证书、域名或反向代理；生产和非 localhost 地址使用 HTTPS。

CLI **不**直接调用模型或 Redis；编排在 Runtime，工具经 Runtime 挂载的
`mcp-app-collections`（MCP）提供。

## Development

先启动 Runtime，再在仓库根目录：

```bash
pnpm --filter assistant-runtime-service dev
pnpm --filter assistant-cli dev -- ping
pnpm --filter assistant-cli dev -- stream "hello assistant"
```

或：

```bash
ASSISTANT_RUNTIME_URL=http://localhost:9030 pnpm --filter assistant-cli start -- ping
```

| Command           | Purpose                          |
| ----------------- | -------------------------------- |
| `ping`            | `GET /assistant/ping`            |
| `stream <prompt>` | `GET /assistant/stream` SSE stub |
| `help`            | Usage                            |
