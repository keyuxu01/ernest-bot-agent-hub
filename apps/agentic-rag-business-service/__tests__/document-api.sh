#!/usr/bin/env bash
# 文档接口联调：上传会记下 id，后续 get / patch / delete 不用手抄。
#
#   cd apps/agentic-rag-business-service/__tests__
#   ./document-api.sh samples
#   ./document-api.sh get
#   ./document-api.sh curls
#
# 覆盖地址：BASE_URL=http://127.0.0.1:9020 ./document-api.sh list
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9020}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SAMPLES="$ROOT/test-files"
STATE="${TMPDIR:-/tmp}/ernest-document-api.last-id"

need_jq() {
  command -v jq >/dev/null || {
    echo "需要 jq：brew install jq" >&2
    exit 1
  }
}

save_id() {
  local id="$1"
  printf '%s' "$id" >"$STATE"
  echo "DOC_ID=$id  (已写入 $STATE)"
}

load_id() {
  local id="${1:-}"
  if [[ -n "$id" ]]; then
    printf '%s' "$id"
    return
  fi
  if [[ -f "$STATE" ]]; then
    cat "$STATE"
    return
  fi
  echo "没有文档 id。先跑：./document-api.sh upload <file> 或 samples" >&2
  exit 1
}

pretty() {
  if command -v jq >/dev/null; then
    jq .
  else
    cat
  fi
}

summary() {
  need_jq
  jq '{
    id, title, status, parser, wordCount, contentLength, imageCount,
    contentSummary, source
  }'
}

cmd_upload() {
  local file="${1:-}"
  [[ -n "$file" && -f "$file" ]] || {
    echo "用法: $0 upload <file>" >&2
    exit 1
  }
  need_jq
  local body
  body="$(
    curl -sS -X POST "$BASE_URL/documents/upload/parse" \
      -F "file=@${file}" \
      -F "createBy=10001"
  )"
  printf '%s\n' "$body" | summary
  local id
  id="$(printf '%s' "$body" | jq -r '.id // empty')"
  [[ -n "$id" ]] || {
    echo "上传失败（响应没有 id）" >&2
    printf '%s\n' "$body" >&2
    exit 1
  }
  save_id "$id"
}

cmd_create() {
  need_jq
  local body
  body="$(
    curl -sS -X POST "$BASE_URL/documents" \
      -H 'Content-Type: application/json' \
      -d '{"title":"curl smoke","content":"## smoke\n\nfrom document-api.sh"}'
  )"
  printf '%s\n' "$body" | jq '{id, title, status, wordCount}'
  save_id "$(printf '%s' "$body" | jq -r '.id')"
}

cmd_get() {
  local id
  id="$(load_id "${1:-}")"
  echo "GET /documents/$id"
  curl -sS "$BASE_URL/documents/$id" | pretty
}

cmd_list() {
  curl -sS "$BASE_URL/documents?page=1&pageSize=20" | pretty
}

cmd_publish() {
  local id
  id="$(load_id "${1:-}")"
  echo "PUT /documents/$id/publish"
  curl -sS -X PUT "$BASE_URL/documents/$id/publish" | pretty
}

cmd_patch() {
  local id
  id="$(load_id "${1:-}")"
  echo "PATCH /documents/$id"
  curl -sS -X PATCH "$BASE_URL/documents/$id" \
    -H 'Content-Type: application/json' \
    -d '{"title":"updated from document-api.sh","updateBy":"10001"}' | pretty
}

cmd_delete() {
  local id
  id="$(load_id "${1:-}")"
  echo "DELETE /documents/$id"
  curl -sS -X DELETE "$BASE_URL/documents/$id" | pretty
  echo "再次 GET，期望 404"
  curl -sS -w '\nHTTP %{http_code}\n' "$BASE_URL/documents/$id"
}

cmd_samples() {
  local file found=0
  for file in "$SAMPLES"/*.pdf "$SAMPLES"/*.docx "$SAMPLES"/*.xlsx "$SAMPLES"/*.pptx "$SAMPLES"/*.txt "$SAMPLES"/*.md; do
    [[ -f "$file" ]] || continue
    found=1
    echo
    echo "======== $(basename "$file") ========"
    cmd_upload "$file"
  done
  [[ "$found" -eq 1 ]] || {
    echo "没有样例：把文件放到 $SAMPLES" >&2
    exit 1
  }
}

cmd_flow() {
  local file="${1:-}"
  [[ -n "$file" ]] || {
    echo "用法: $0 flow <file>" >&2
    exit 1
  }
  cmd_upload "$file"
  echo
  cmd_get
}

cmd_curls() {
  local id
  id="$(load_id "${1:-}" 2>/dev/null || true)"
  cat <<EOF
export BASE_URL='${BASE_URL}'
export DOC_ID='${id:-<先 upload 再 curls>}'

# 上传（记下响应里的 id）
curl -sS -X POST "\$BASE_URL/documents/upload/parse" \\
  -F "file=@${SAMPLES}/员工考勤表.xlsx" \\
  -F "createBy=10001" | jq '{id, title, parser, wordCount, imageCount, source}'

# 详情（要 id）
curl -sS "\$BASE_URL/documents/\$DOC_ID" | jq '{id, title, content}'

# 列表
curl -sS "\$BASE_URL/documents?page=1&pageSize=20" | jq

# 发布（要 id）
curl -sS -X PUT "\$BASE_URL/documents/\$DOC_ID/publish" | jq '{id, title, status}'

# 改标题（要 id）
curl -sS -X PATCH "\$BASE_URL/documents/\$DOC_ID" \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"updated","updateBy":"10001"}' | jq

# 软删（要 id）
curl -sS -X DELETE "\$BASE_URL/documents/\$DOC_ID" | jq
EOF
}

cmd_help() {
  cat <<EOF
用法: $0 <命令> [参数]

  samples          上传 $SAMPLES 下全部样例，每次记下最后一个 id
  upload <file>    上传并解析，记下 id
  create           JSON 创建一篇，记下 id
  get [id]         详情（默认用上次记下的 id）
  list             分页列表
  publish [id]     发布并投递 RAG
  patch [id]       改标题
  delete [id]      软删后再 GET
  flow <file>      upload + get
  curls [id]       打印可复制的 curl（带当前 DOC_ID）

环境: BASE_URL=$BASE_URL
上次 id: $( [[ -f "$STATE" ]] && cat "$STATE" || echo '(无)' )
EOF
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "$cmd" in
    samples | upload | create | get | list | publish | patch | delete | flow | curls | help)
      "cmd_$cmd" "$@"
      ;;
    -h | --help)
      cmd_help
      ;;
    *)
      echo "未知命令: $cmd" >&2
      cmd_help
      exit 1
      ;;
  esac
}

main "$@"
