# ADR-0025：RagBusiness 权限码 RBAC 与团队管理

- 状态：Accepted
- 日期：2026-10-31
- 来源：迁入 knowledge-hub-backend 的 `64dedb2f442aed9d54b15da9877f34f38a256081`（v9）。
- 相关：[ADR-0024](./0024-rag-business-built-in-auth-and-roles.md)
- 补充：ADR-0024「只有角色级授权」。角色守卫保留，新增权限码守卫叠加在其后。

## 背景与决策

ADR-0024 只按角色授权。前端菜单 / 按钮需要更细的开关，管理端也需要按团队组织用户。
本次在 `agentic-rag-business-service` 内按源提交补齐：

- PostgreSQL 新增 `kh_permission`（树形，`parent_id = 0` 为根，类型 1 菜单 2 按钮 3 接口，软删）、
  `kh_role_permission`、`kh_user_permission`。预置菜单 / 按钮权限，并给 `ROLE_REVIEWER`
  绑定「文档列表、文档审核」，给 `ROLE_USER` 绑定「首页、文档中心、文档列表、创建文档、搜索、个人中心」。
- 生效权限 = 用户直接权限 ∪ 角色权限（仅启用且未删除）；持有 `ROLE_ADMIN` 时追加
  `ADMIN_OPERATION_PERMISSIONS`。`AuthUser` 增加 `permissions`，登录结果与 `GET /auth/me` 随之返回。
  与角色一样在每次请求时由 `buildAuthUser` 重读，不写进 JWT。
- `@RequirePermission(...codes)` + 全局 `PermissionsGuard`（顺序 JWT → Roles → Permissions）：
  未标注放行；`ROLE_ADMIN` 直接放行；否则须命中其一，不满足抛 `ForbiddenException('权限不足')`。
- 权限管理 `/permissions`（管理员）：list / tree / page / children / 详情 / 新增 / 修改 / 删除
  （有子权限或仍有角色 / 用户绑定时拒绝）。角色绑权限 `GET|PUT /roles/:id/permissions`；
  用户直接权限 `GET|PUT /users/:id/permissions`（GET 同时返回合并后的权限码）。
  `PUT /users/:id/roles` 额外要求 `system:user`。
- 团队 `TeamModule`（`src/modules/team`）：`kh_team`（树形，软删）与 `kh_team_member`（leader / member）。
  `/teams` 全部要求管理员（类级 `@Roles(ADMIN)`），除 `GET /teams/tree` 外还要求 `system:team`。

与源提交的差异（项目约定、环境差异或集成测试发现的问题）：

- 数据访问经 `PermissionRepository` / `TeamRepository`；`PermissionService` 复用
  `UserRepository.getRoleCodes` 与 `RoleRepository.findById`，不在 Service 注入 TypeORM Repository。
- 权限常量放 `src/modules/user/constants/permission.constants.ts`（只在 user 模块使用），
  不放全局 `common/constants`。
- 时间列使用 `TIMESTAMPTZ`（与现有 `kh_*` 表一致）。
- 预置团队的负责人与成员：源提交在 init SQL 里把种子账号 `admin`（leader）和 `user`（member）写入
  团队，本服务不预置账号，这些用户 ID 不存在，`kh_team_member` 外键会失败。改为 init 只建两个团队，
  `AuthService.onModuleInit` 新建初始管理员时调用 `TeamService.assignSeedTeamLeader`，把管理员设为
  两个团队的 `leader_id` 并写入 leader 成员行；源提交中的普通成员 `user` 没有对应账号，不预置。
- `GET /teams/tree` 去掉源提交的 `@Public()`。`RolesGuard` 用 `getAllAndOverride([handler, class])`
  读取 `@Roles`，方法上没有时取类上的 `@Roles(ADMIN)`；而 `@Public()` 让 JWT 守卫跳过、`request.user`
  为空，源提交里这个接口对任何人都是 403（e2e 发现）。现在它和其他团队接口一样要求登录 + 管理员，
  `RolesGuard` 不改。

## 边界与后果

沿用源提交的已知风险：

- 权限码由 `@RequirePermission` 写死在代码中，`kh_permission.api_url / method` 只是描述，不参与校验；
  在库里改编码会让对应接口失去匹配（管理员不受影响）。
- `ROLE_ADMIN` 绕过权限码校验，`ADMIN_OPERATION_PERMISSIONS` 只影响返回给前端的 `permissions`。
  目前所有 `@RequirePermission` 接口同时要求 `ROLE_ADMIN`，权限码对它们没有额外收紧作用。
- 文档、审核接口仍只按角色授权，没有接入 `document:*` 权限码。
- 角色 / 用户权限替换为先删后插，不在同一事务。
- 权限删除为软删，但 `permission_code` 是全表唯一约束：用已删除权限的编码新建会通过服务层查重，
  再被数据库拒绝（500）。
- `PUT /permissions/:id` 不校验 `parentId` 是否存在或是否成环（只拒绝指向自己）；团队同理。
- 团队成员接口的请求体是裸数组，`ValidationPipe` 不校验元素类型；`leaderId` 不校验用户存在，
  也不会写入成员表。删除团队会物理删除成员。
- 每次请求多 3 次查询（直接权限、角色权限、角色编码）。
- 新表只由 init 脚本创建；已有数据卷需手动执行 `02-knowledge-hub.sql` 中「权限 RBAC」与「团队」两段
  （均为 `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`，可重复执行），或重建数据卷。

## 验证

单元测试覆盖初始管理员新建时担任预置团队负责人（已存在时不改）、`PermissionsGuard`
（未标注、命中、管理员放行、缺权限、无用户）、生效权限合并与管理员追加、权限树构建、编码冲突、
仍有绑定时拒绝删除、角色权限替换前校验 ID。
e2e 在真实 PostgreSQL 上跑通（`REQUIRE_EMAIL_VERIFICATION=true`）：`/auth/me` 返回权限码、
非管理员访问权限树 403、预置审核员权限、新增 / 重复编码 / 绑定到用户后立即生效 / 有绑定拒删 /
解绑后软删；团队树未登录 401、非管理员 403、团队增删、成员增删与列表。
