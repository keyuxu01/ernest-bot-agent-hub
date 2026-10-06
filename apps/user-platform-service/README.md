# user-platform-service

Assistant 身份与访问边界的 NestJS 服务。当前切片只提供经过配置校验的进程入口与健康检查；Google OAuth、Assistant 用户注册表和令牌签发将在对应 OpenSpec 任务中实现。

```bash
pnpm --filter user-platform-service dev
pnpm --filter user-platform-service test:e2e
```

默认监听 `9040`，本地覆盖值放在不会提交的 `.env.local` 中。
