# ADR-0024：RagBusiness 内置账号、JWT 鉴权与角色

- 状态：Accepted
- 日期：2026-10-25
- 来源：迁入 knowledge-hub-backend 的 `84bc6b1054354b3b5bdff9a24e11f82fdbf07160`（v7）。
- 相关：[ADR-0018](./0018-separate-user-platform-assistant-runtime-and-cli.md)、
  [ADR-0023](./0023-document-publish-review-workflow.md)
- 部分替代：ADR-0023「审核接口未鉴权、审核人由请求体传入」这一已知风险。

## 背景与决策

审核流需要知道「谁在审核」，并且只允许审核员操作。现在评估过两种外置方案：
一是把身份和角色都交给 UserPlatform，二是 UserPlatform 管身份、RAG 管角色。
两者都依赖 UserPlatform 先具备登录与签发能力，而这部分目前还没有实现
（`implement-node-assistant-runtime` 的 5.x 任务）。因此先在 `agentic-rag-business-service`
内实现账号与角色：

- PostgreSQL 新增 `kh_user`、`kh_role`、`kh_user_role`，沿用 `kh_` 前缀与雪花 BIGINT ID，
  与 `kh_document.author_id / create_by`、`kh_document_review.reviewer_id` 直接关联。
  预置 `ROLE_ADMIN`、`ROLE_REVIEWER`、`ROLE_USER`。
- 用户名 + bcrypt 密码注册 / 登录。注册即启用，并授予 `ROLE_USER`。
- 使用 HS256 JWT，access 与 refresh 两种 token 以 `type` 区分，共用 `JWT_SECRET`
  （至少 32 字符，没有缺省值）。有效期由 `JWT_ACCESS_TTL_SECONDS` / `JWT_REFRESH_TTL_SECONDS` 配置。
- 全局 `JwtAuthGuard` + `RolesGuard`：接口默认需要登录，公开接口须显式标 `@Public()`
  （登录 / 注册 / 刷新、健康检查、greeting、OpenAPI）。
- 每次请求在验签之后都按 `sub` 重读用户与角色，禁用账号或调整角色会即时生效。
- 审核工作台（列表 / 计数 / 通过 / 驳回）要求 `ROLE_REVIEWER` 或 `ROLE_ADMIN`。
  审核人取自登录用户，请求体不再接受 `reviewerId / reviewerName`。
- 文档的 `createBy / updateBy` 以登录用户为准，不信任请求体；`authorId` 未传时取登录用户。

与源提交的有意差异：

- 不预置固定密码的测试账号。初始管理员由可选的 `AUTH_BOOTSTRAP_ADMIN_USERNAME / PASSWORD`
  在启动时创建（拥有 ADMIN + REVIEWER），已存在时不改动。
- `JWT_SECRET` 没有代码内缺省值；验签固定只接受 HS256，并用 Zod 校验 token 负载。
- 用户名不存在时也做一次 bcrypt 比对，响应耗时不暴露用户名是否存在。
  密码要先验证通过，才会报「账户已禁用」。
- 用户名唯一由部分唯一索引兜底；建用户与授予角色放在同一事务中。
- 与源提交一致使用 passport：`JwtAuthGuard extends AuthGuard('jwt')`，`JwtStrategy`（passport-jwt）
  验签后由 `validate` 调 `AuthService.buildAuthUser` 组装当前用户。
  缺少 token 或验签失败返回 401，`validate` 抛出的错误原样透出。
  `RolesGuard` 同源提交：角色不足抛 `ForbiddenException`（403）。
  登录、注册、刷新使用稳定错误码 `AUTH_*`。

守卫与业务只依赖 `AuthUser`。将来改由 UserPlatform 签发 token 时，替换 `JwtStrategy` 的验签配置
和 `buildAuthUser` 的用户来源即可，Controller 不变。

## 边界与后果

- refresh token 无状态、不可吊销：泄露后只能等它过期，或更换 `JWT_SECRET`（会使全部 token 失效）。
- 登录没有限流、锁定或验证码，存在暴力破解风险，上线前需要在网关或服务内补齐。
- 只有角色级授权。不校验文档归属，任何登录用户都能修改、发布、删除任意文档，
  作者也可以审核自己的文档（只要持有审核员角色）。
- 每个请求多一次用户查询和一次角色查询。
- 本服务与 UserPlatform 各有一套用户体系。将来统一身份时需要迁移账号，并对齐 ID 类型
  （UserPlatform 的 `user_id` 为 varchar）。
- 新表只由 init 脚本创建；已有数据卷需要手动执行建表段落，或重建数据卷。

## 验证

单元测试覆盖：

- 环境校验：密钥长度、有效期为正整数、初始管理员须成对配置；
- 凭据校验：未知用户与错误密码返回同一结果、禁用判断在密码之后、不泄露密码哈希；
- 注册：哈希入库、授予 ROLE_USER、重名返回 null；初始管理员的创建与跳过；
- token：签发、access 与 refresh 互不可用、他人密钥与畸形负载被拒、用户失效后被拒；
- 守卫：`@Public()` 放行、缺少 user 返回 401、策略错误原样透出、refresh token 不能当 access 用、
  角色不足或无角色时抛 ForbiddenException；
- 文档：审核人与 createBy 取自登录用户。

e2e 在真实 PostgreSQL / MongoDB 上跑通：

- 未登录访问返回 401；注册 → 登录 → `/auth/me`；错误密码与重名注册；
- 完整审核流：创建 → 发布进入待审 → 重复提审被拒 → 普通用户审核返回 403
  → 请求体伪造审核人返回 400 → 审核员通过 → 重复结案被拒 → 历史记录中的审核人正确
  → 已发布文档直接改稿被拒。

RabbitMQ / ES / Neo4j 在 e2e 中以 mock 替代。
