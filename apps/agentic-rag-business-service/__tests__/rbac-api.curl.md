# RBAC / 权限 / 团队接口 curl

含：权限树 CRUD、角色 / 用户绑权限、`@RequirePermission()`、团队管理。

服务：`http://127.0.0.1:9020`（先 `pnpm --filter agentic-rag-business-service dev`）。
管理员用 `.env.dev` 里的 `AUTH_BOOTSTRAP_ADMIN_USERNAME / PASSWORD`；`ROLE_ADMIN` 跳过权限码校验。

```bash
export BASE_URL='http://127.0.0.1:9020'

export ADMIN_TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"<管理员用户名>","password":"<管理员密码>"}' | jq -r '.accessToken')
```

## 1. 当前用户权限

`/auth/me` 与登录返回的 `userInfo` 都带 `roles` 与 `permissions`：

```bash
curl -sS "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '{roles, permissions}'
```

## 2. 权限树

```bash
curl -sS "$BASE_URL/permissions/tree" -H "Authorization: Bearer $ADMIN_TOKEN" | jq
curl -sS "$BASE_URL/permissions/list" -H "Authorization: Bearer $ADMIN_TOKEN" | jq
curl -sS "$BASE_URL/permissions/page?page=1&pageSize=20&keyword=document" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq
curl -sS "$BASE_URL/permissions/4000000000000000002/children" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

```bash
export PERM_ID=$(curl -sS -X POST "$BASE_URL/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "permissionName": "导出文档",
    "permissionCode": "document:export",
    "permissionType": 2,
    "parentId": "4000000000000000002",
    "sort": 6
  }' | jq -r '.id')

curl -sS -X PUT "$BASE_URL/permissions/$PERM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"permissionName": "导出文档 v2"}' | jq

# 有子权限或仍被角色 / 用户绑定时返回 400
curl -sS -X DELETE "$BASE_URL/permissions/$PERM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

## 3. 角色绑权限（全量替换）

```bash
# 审核员角色 id = 2000000000000000002
curl -sS "$BASE_URL/roles/2000000000000000002/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq

curl -sS -X PUT "$BASE_URL/roles/2000000000000000002/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"permissionIds": ["4000000000000000011", "4000000000000000015"]}' | jq
```

## 4. 用户直接绑权限（全量替换）

```bash
export USER_ID='<用户 id，见 GET /users/page>'

# permissionCodes 为合并后的生效权限，directPermissionIds 为直接绑定
curl -sS "$BASE_URL/users/$USER_ID/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq

curl -sS -X PUT "$BASE_URL/users/$USER_ID/permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"permissionIds": ["4000000000000000012"]}' | jq
```

## 5. 团队管理

团队接口都需管理员；除团队树外还需 `system:team`：

```bash
curl -sS "$BASE_URL/teams/tree" -H "Authorization: Bearer $ADMIN_TOKEN" | jq
curl -sS "$BASE_URL/teams/tree?rootOnly=true" -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

```bash
curl -sS "$BASE_URL/teams/page?page=1" -H "Authorization: Bearer $ADMIN_TOKEN" | jq

export TEAM_ID=$(curl -sS -X POST "$BASE_URL/teams" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"teamName":"前端组","teamCode":"FE","parentId":"8000000000000000001"}' | jq -r '.id')

# 成员接口的请求体是用户 id 数组
curl -sS -X POST "$BASE_URL/teams/$TEAM_ID/members" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "[\"$USER_ID\"]" | jq
curl -sS "$BASE_URL/teams/$TEAM_ID/members" -H "Authorization: Bearer $ADMIN_TOKEN" | jq
curl -sS -X DELETE "$BASE_URL/teams/$TEAM_ID/members" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "[\"$USER_ID\"]" | jq

curl -sS -X DELETE "$BASE_URL/teams/$TEAM_ID" -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

未安装 `jq` 时去掉 `| jq`。
