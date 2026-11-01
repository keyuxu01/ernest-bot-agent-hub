# 全文搜索 / 知识图谱接口 curl

服务：`http://127.0.0.1:9020`（先 `pnpm --filter agentic-rag-business-service dev`）。
文档须先发布（开启审核时还要审核通过），消费者写完 ES / Neo4j 后才能搜到；KG 要等 LLM 抽取完成。

```bash
export BASE_URL='http://127.0.0.1:9020'

export TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"<用户名>","password":"<密码>"}' | jq -r '.accessToken')
```

## 1. 全文搜索（`search` 权限码；普通用户、审核员、管理员默认都有）

查 ES `kh_document`：标题权重 3、摘要 2、正文 1，IK 中文分词，返回高亮片段，不回传正文。

```bash
curl -sS -X POST "$BASE_URL/search" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"keyword":"报销流程","page":1,"pageSize":10}' | jq

# 按作者 / 分类过滤
curl -sS -X POST "$BASE_URL/search" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"keyword":"报销","authorId":"<作者 ID>","categoryId":"<分类 ID>"}' | jq
```

ES 出错时返回 `{"items":[],"total":0,...}`，原因看服务日志「搜索查询失败」。

## 2. 知识图谱（只需登录）

中文关键词用 `--data-urlencode` 编码。

```bash
# 关键词匹配实体名 / 描述、文档标题 / 摘要、块标题 / 正文
curl -sS -G "$BASE_URL/graph/search" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'keyword=报销' --data-urlencode 'limit=20' | jq

# 实体节点（可按类型过滤：PERSON / ORGANIZATION / CONCEPT / PROCESS …）
curl -sS -G "$BASE_URL/graph/nodes" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'type=PROCESS' --data-urlencode 'limit=50' | jq

# 实体间 RELATED_TO 边
curl -sS "$BASE_URL/graph/edges?limit=100" -H "Authorization: Bearer $TOKEN" | jq
```

Neo4j 出错时返回 `[]`，原因看服务日志「图谱…查询失败」。

未安装 `jq` 时去掉 `| jq`。
