# RAG 检索与问答接口 curl

一篇文档召回的块都来自同一篇，看不出混合检索有没有跨文档排序。这里一次发布 4 篇主题不同的文档，
再测 `POST /rag/search`（只召回）和 `POST /ai/chat`（召回后作答）。两个接口都要权限码 `search`。

服务：`http://127.0.0.1:9020`（先 `pnpm --filter agentic-rag-business-service dev`）。

```bash
export BASE_URL='http://127.0.0.1:9020'

export TOKEN=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"<管理员用户名>","password":"<管理员密码>"}' | jq -r '.accessToken')
```

## 1. 发布 4 篇测试文档

正文放在仓库根目录 `test-files/rag-*.json`，用 `-d @-` 读入，避免把长正文粘进命令行。

**默认开启审核**（`DOCUMENT_REQUIRE_APPROVAL` 未设或为 true）：先建草稿，再提审、审核通过。管理员同时有审核员角色：

```bash
for f in canary onboarding incident visibility; do
  ID=$(jq '.status = 0' ../../../test-files/rag-$f.json \
    | curl -sS -X POST "$BASE_URL/documents" \
        -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d @- \
    | jq -r .id)
  curl -sS -X PUT "$BASE_URL/documents/$ID/publish" -H "Authorization: Bearer $TOKEN" >/dev/null
  TASK=$(curl -sS "$BASE_URL/documents/$ID/reviews/current" -H "Authorization: Bearer $TOKEN" | jq -r .id)
  curl -sS -X POST "$BASE_URL/documents/reviews/tasks/$TASK/approve" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' | jq '{id, title, status}'
done
```

**免审**（`.env.dev` 设 `DOCUMENT_REQUIRE_APPROVAL=false` 并重启）：文件里已带 `"status": 1`，直接创建即发布：

```bash
curl -sS -X POST "$BASE_URL/documents" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d @../../../test-files/rag-canary.json | jq '{id, title, status}'
```

分块 + 向量写入是异步的，等日志出现 `ES 批量索引成功` 再搜（约十几秒）。

## 2. `POST /rag/search`（只召回，不调 LLM）

看 `documentTitle` 是否来自**不同文档**。`score` 是 rerank 分（0–1）；rerank 失败时是 RRF 分（约 0.01–0.03）。

```bash
# 应对上「生产灰度发布…」；问句里没有「灰度发布」四个字
curl -sS -X POST "$BASE_URL/rag/search" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"上线前如何做金丝雀或小流量验证？","topK":8}' | jq '.[] | {documentTitle, heading, score}'

# 应对上「新员工入职指南」
curl -sS -X POST "$BASE_URL/rag/search" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"新员工第一周要装什么、VPN 连不上找谁","topK":8}' | jq '.[] | {documentTitle, score}'

# 跨文档：灰度职责 vs 故障指挥，前几名应出现两篇
curl -sS -X POST "$BASE_URL/rag/search" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"生产出故障是找李明还是找值班经理？","topK":8}' | jq '.[] | {documentTitle, score}'
```

## 3. `POST /ai/chat`（召回后作答）

```bash
curl -sS -X POST "$BASE_URL/ai/chat" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"P0 故障谁指挥？和日常发布的李明是不是同一人？","topK":5}' | jq '{answer, sources}'
```

期望：回答区分「发布放行李明」和「故障指挥王芳」，句末带 `[n]`；`sources` 只列回答里引用到的资料。

没有命中时返回 `{"answer":"知识库里没有相关内容。","sources":[]}`：检查四篇是否 `status=1`、
`kh_chunk` 是否有数据（`curl localhost:9200/kh_chunk/_count`），以及日志里有没有 `关键词检索失败` / `向量检索失败`。

## 4. 清理

```bash
# 软删后会异步清掉 kh_chunk / kh_document / Neo4j 里的数据
curl -sS -X DELETE "$BASE_URL/documents/<文档 ID>" -H "Authorization: Bearer $TOKEN"
```

未安装 `jq` 时去掉 `| jq ...`。
