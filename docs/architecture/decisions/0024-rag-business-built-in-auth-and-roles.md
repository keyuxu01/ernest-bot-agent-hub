# ADR-0024：RagBusiness 内置账号、JWT 鉴权、角色与用户管理

- 状态：Accepted
- 日期：2026-10-25
- 来源：迁入 knowledge-hub-backend 的 `84bc6b1054354b3b5bdff9a24e11f82fdbf07160`（v7）
  与 `7c36ac86e3860f240c0dc9740177c6d505aaff52`（v8）。
- 相关：[ADR-0008](./0008-use-redis.md)、[ADR-0018](./0018-separate-user-platform-assistant-runtime-and-cli.md)、
  [ADR-0023](./0023-document-publish-review-workflow.md)
- 部分替代：ADR-0023「审核接口未鉴权、审核人由请求体传入」这一已知风险。

## 背景与决策

审核流需要知道「谁在审核」，并且只允许审核员操作。把身份交给 UserPlatform 的方案依赖它先具备
登录与签发能力，而这部分目前还没有实现（`implement-node-assistant-runtime` 的 5.x 任务）。
因此先在 `agentic-rag-business-service` 内实现账号体系，服务接口与行为对齐源提交：

- PostgreSQL 新增 `kh_user`（含 `email_verified`）、`kh_role`、`kh_user_role`，沿用 `kh_` 前缀与
  雪花 BIGINT ID。预置 `ROLE_ADMIN`、`ROLE_REVIEWER`、`ROLE_USER`。
- 用户名 + bcrypt 密码注册 / 登录，注册授予 `ROLE_USER`。HS256 JWT，access 与 refresh 以 `type`
  区分；有效期 `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES`（缺省 2h / 7d）。
- passport：`JwtAuthGuard extends AuthGuard('jwt')`，`JwtStrategy.validate` 调 `buildAuthUser`
  按 `sub` 重读用户与角色；`RolesGuard` 角色不足抛 `ForbiddenException`。接口默认需要登录，
  公开接口须显式标 `@Public()`。
- 审核工作台要求 `ROLE_REVIEWER` 或 `ROLE_ADMIN`，审核人取自登录用户。
- v8 新增：
  - 用户管理（`/users`，管理员）：分页、详情、创建、更新、软删、重置密码、查询 / 全量替换角色；
    当前用户：更新资料、个人文档统计、修改密码。
  - 角色管理（`/roles`，管理员）：列表、详情、创建、更新、删除（仍有用户绑定时拒绝）。
  - 邮箱激活：`REQUIRE_EMAIL_VERIFICATION=true` 时，带邮箱注册的账号先禁用，激活链接
    （Redis 令牌 24 小时）经 `GET /auth/verify-email` 启用。缺省 false。
  - 找回密码：`POST /auth/password/reset/send-code` 发 6 位验证码（Redis 10 分钟，60 秒冷却），
    `POST /auth/password/reset` 校验后重置。`POST /auth/logout` 只返回提示（无状态 JWT）。
  - 基础设施：`src/infrastructure/redis`（ioredis，全局 `RedisService`）与 `src/infrastructure/mail`
    （`@nestjs-modules/mailer` + nodemailer SMTP）。

与源提交的差异（项目约定或安全要求）：

- 数据访问经 `UserRepository` / `RoleRepository`；个人统计经 `DocumentRepository`，
  不在 Service 注入 TypeORM Repository。
- `JWT_SECRET` 必填（环境校验 + `getOrThrow`），不使用代码缺省值。
- 不预置固定密码（`123456`）的测试账号；初始管理员由可选 `AUTH_BOOTSTRAP_ADMIN_USERNAME / PASSWORD`
  在启动时创建（ADMIN + REVIEWER），已存在时不改动。
- 文档的 `createBy / updateBy` 以登录用户为准，不信任请求体；`authorId` 未传时取登录用户。
- 审核请求体拆为 `ApproveReviewDto`（意见可选）与 `RejectReviewDto`（意见必填）。
- 找回密码验证码输错 3 次即作废，返回「验证码错误次数过多，请重新获取」（源提交不限次数）。
- 依赖按源提交锁定解析版本：`@nestjs-modules/mailer@2.3.7`、`ioredis@5.11.1`、`nodemailer@9.0.5`。
  为绕开 `@types/mjml` 上游发布错误（依赖不存在的 `@types/mjml-core`），workspace 覆盖为 `5.0.0`。

## 边界与后果

以下为沿用源提交的已知风险，上线前需要处理：

- refresh token 无状态、不可吊销；修改 / 重置密码、禁用或删除用户都不会使已签发 token 失效
  （access 在有效期内仍可用，被删用户会在下次查库时返回 404）。
- 登录没有限流或锁定。找回密码的验证码输错 3 次即作废（Redis INCR 计数，与验证码同寿命），
  需重新获取，重发仍受 60 秒冷却限制；验证码由 `Math.random` 生成。
- `send-code` 对未注册邮箱返回 404，可被用来枚举邮箱。
- 邮件 HTML 直接拼接用户名，未转义。
- 管理员创建用户、用户修改资料时不校验邮箱唯一，也不重新验证邮箱。
- 校验凭据时先判断 `status`：邮箱未激活的账号同时是禁用状态，登录提示为「账户已禁用」。
- 角色替换、建用户与授角色不在同一事务；角色删除为物理删除。
- 只有角色级授权，不校验文档归属；作者也可以审核自己的文档。
- Redis 不可用时 ioredis 持续重连、不阻断启动，激活与找回密码请求失败；SMTP 未配置时邮件发送失败。
- 本服务与 UserPlatform 各有一套用户体系；将来统一身份需迁移账号并对齐 ID 类型。
- 新表 / 新列只由 init 脚本创建；已有数据卷需手动执行，或重建数据卷。

## 验证

单元测试覆盖凭据校验（未知用户、错误密码、禁用、未激活）、注册（哈希、角色、邮箱冲突、
需激活时禁用）、激活、角色替换（缺失角色）、改密、个人统计、初始管理员、token 签发 / 刷新、
激活邮件与验证码发送失败回滚、验证码冷却与校验、守卫与策略。

e2e 在真实 PostgreSQL / MongoDB 上跑通（Redis 与 SMTP 用内存替身，RabbitMQ / ES / Neo4j 用 mock）：
注册登录、审核全流程与角色校验、管理员用户与角色管理、个人资料 / 统计 / 改密、邮件验证码找回密码。
