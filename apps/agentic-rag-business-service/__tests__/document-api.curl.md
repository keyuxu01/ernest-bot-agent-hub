# 文档接口 curl

服务：`http://127.0.0.1:9020`（先 `pnpm --filter agentic-rag-business-service dev`）

需要串 id 时用旁边的脚本，不用手抄：

```bash
cd apps/agentic-rag-business-service/__tests__
./document-api.sh samples          # 上传 test-files，记下最后一个 id
./document-api.sh get              # 用刚才的 id 拉详情
./document-api.sh curls            # 打印带 DOC_ID 的 curl
```

下面这些可以单独复制。先跑一条 upload，把 `id` 填进 `DOC_ID`。

```bash
export BASE_URL='http://127.0.0.1:9020'
export DOC_ID=''   # 上传响应里的 id
```

## 上传解析（返回 id，不含完整正文）

```bash
# xlsx
curl -sS -X POST "$BASE_URL/documents/upload/parse" \
  -F "file=@../../../test-files/员工考勤表.xlsx" \
  -F "createBy=10001" | jq '{id, title, parser, wordCount, imageCount, source}'

# docx
curl -sS -X POST "$BASE_URL/documents/upload/parse" \
  -F "file=@../../../test-files/梁多强_Agent开发_17601230573.docx" \
  -F "createBy=10001" | jq '{id, title, parser, wordCount, imageCount}'

# pdf
curl -sS -X POST "$BASE_URL/documents/upload/parse" \
  -F "file=@../../../test-files/李先生_28岁_76761.pdf" \
  -F "createBy=10001" | jq '{id, title, parser, wordCount, imageCount}'

# pptx
curl -sS -X POST "$BASE_URL/documents/upload/parse" \
  -F "file=@../../../test-files/申论总结课.pptx" \
  -F "createBy=10001" | jq '{id, title, parser, wordCount, imageCount}'
```

可选表单字段：`title` `categoryId` `teamId` `authorId` `tags` `remark` `createBy`。

上传成功后：

```bash
export DOC_ID='这里填响应里的 id'
```

## 要 id 的接口

```bash
# 详情（含 Markdown 正文）
curl -sS "$BASE_URL/documents/$DOC_ID" | jq '{id, title, status, wordCount, content}'

# 改标题
curl -sS -X PATCH "$BASE_URL/documents/$DOC_ID" \
  -H 'Content-Type: application/json' \
  -d '{"title":"updated","updateBy":"10001"}' | jq '{id, title}'

# 软删
curl -sS -X DELETE "$BASE_URL/documents/$DOC_ID" | jq

# 再查，期望 404
curl -sS -w '\nHTTP %{http_code}\n' "$BASE_URL/documents/$DOC_ID"
```

## 不要 id

```bash
curl -sS "$BASE_URL/health/whoami" | jq
curl -sS "$BASE_URL/documents?page=1&pageSize=20" | jq

curl -sS -X POST "$BASE_URL/documents" \
  -H 'Content-Type: application/json' \
  -d '{"title":"curl smoke","content":"## smoke"}' | jq '{id, title}'
```
