# ADR-0027：RagBusiness 混合检索（BM25 + kNN → RRF → rerank）与 RAG 问答

- 状态：Accepted
- 日期：2026-11-01
- 来源：迁入 knowledge-hub-backend 的 `2b2598573f1090528ed6ad1704bc4fc1b115fecf`（v11）。
- 相关：[ADR-0016](./0016-use-elasticsearch-for-rag-chunks.md)、
  [ADR-0017](./0017-place-qwen-embedding-in-infrastructure.md)、
  [ADR-0026](./0026-rag-business-search-and-graph-read-apis.md)
- 部分替代：ADR-0026「`kh_document` 未用 IK 时启动自动删除重建」。

## 背景与决策

`kh_chunk` 已经有块正文与向量，但还没有读取方。v11 增加按块检索与基于检索结果的问答：

- **两路召回**（`VectorIndexService`）：
  - `keywordSearch`：`multi_match` 查 `document_title^2` 与 `content`，`ik_smart` 分词。
  - `knnSearch`：在 `embedding` 上做 kNN，`k = topK`，`num_candidates = max(10k, 50)`。
  - 两者只回传 `chunk_id / document_id / document_title / content / heading`，召回条数限制 1–50。
- **RRF 融合**（`searchHybrid`）：两路并行，各自按原始分排名后按 `Σ 1 / (C + rank)` 累加，
  同一块两路都靠前就排最前；保留 `bm25Score / vectorScore`。没有问题向量时只走关键词。
- **精排**（`RerankerService`）：调用 DashScope `text-rerank`（`QWEN_RERANK_MODEL_NAME`，如 `qwen3-rerank`），
  送入「文档标题 + 章节 + 正文」（最多 2000 字），按返回的相关性分重排。该接口不是 OpenAI 兼容协议，
  LangChain `ChatOpenAI` 不能调用，所以直接 `fetch`。始终启用，调用失败才降级。
- **`HybridRetrievalService.retrieve`**：问题向量化 → RRF（每路 `RAG_HYBRID_TOP_K`，缺省 20；
  `RAG_RRF_C` 缺省 60）→ rerank → 取前 `topK`。向量化失败只走关键词，rerank 失败按 RRF 顺序返回。
- **`AiChatService.chat`**：把召回块编号为 `[1]…[n]`（单块最多 800 字）拼进 prompt，要求只按资料回答
  并在句末标注编号；从回答里解析 `[n]`，只返回实际引用的资料（摘录 200 字），没有编号时返回全部召回。
  问题为空或没有命中时直接返回提示，不调 LLM。
- **接口**（都要 `search` 权限码）：`POST /rag/search`（`query`，`topK` 默认 5、最大 20，不调 LLM）；
  `POST /ai/chat`（`content`，`topK` 默认 5、最大 10）。
- **`kh_chunk` mapping**：`document_title` 与 `content` 改用 `ik_max_word` 写入、`ik_smart` 检索。
  只在索引不存在时创建。
- **`kh_document`**：去掉 v10「未用 IK 就删除重建」的逻辑，只在索引不存在时按 IK 创建。
- **环境变量**：必填 `QWEN_RERANK_MODEL_NAME`、`QWEN_RERANK_URL`（完整接口地址，公共地址或百炼业务空间地址），
  Key 复用 `QWEN_LLM_API_KEY`；可选 `RAG_HYBRID_TOP_K`（缺省 20）、`RAG_RRF_C`（缺省 60）、
  `AI_CHAT_TIMEOUT_MS`（缺省 60000）。
- **测试语料**：`test-files/rag-*.json` 四篇主题不同的文档（灰度发布、入职、故障应急、可见性），
  见 `__tests__/rag-api.curl.md`。

与源提交的差异（项目约定）：

- **Rerank 客户端**：放在 `src/infrastructure/rerank`。去掉源提交的 `RAG_RERANK_ENABLED` 开关与
  `RERANK_API_KEY` / `RERANK_BASE_URL` / `RAG_RERANK_MODEL`：Key 复用 `QWEN_LLM_API_KEY`，模型与完整地址用
  `QWEN_RERANK_MODEL_NAME` / `QWEN_RERANK_URL` 且启动时必填，所以也没有「未配置 Key 就跳过」的分支。
- **问答 LLM**：用 `ChatModelService.answerModel`，与 KG 抽取共用千问配置
  （`QWEN_LLM_API_KEY / QWEN_CODER_TURBO_MODEL_BASE_URL / CHAT_MODEL_NAME`），温度 0.2、超时 `AI_CHAT_TIMEOUT_MS`。
  这些变量启动时必填，所以没有迁入源提交「未配置 Key 抛 503」的分支。
- **RRF 与命中映射**：抽成纯函数 `helpers/rrf-fuse.ts`、`helpers/map-chunk-hits.ts`；
  提示词与长度常量放在 `src/modules/ai/constants`。接口放在 `src/modules/ai`。
- **ES 客户端**：ES 仍是启动强依赖，没有「客户端为空就返回 []」的分支；查询异常按源提交记日志后返回 []。

## 边界与后果

- 检索不按文档是否公开、作者、团队过滤：任何有 `search` 权限码的用户都能召回全部已发布文档的块。
- 查询异常、向量化失败、rerank 失败都静默降级：调用方拿到空结果或未精排的结果，只能从日志区分。
- 每次 `/rag/search` 调 1 次 Embedding、2 次 ES、1 次 rerank；`/ai/chat` 再加 1 次 LLM。都没有缓存和限流。
- 已有的非 IK `kh_chunk` 不会自动重建：需手动删除索引并重新发布文档，否则关键词召回仍按标准分词。
- LLM 未必遵守编号约定；没有编号时 `sources` 返回全部召回，不代表回答真的用到了这些资料。
- 只有单轮问答，没有会话历史，也不流式返回。

## 验证

- 单测：RRF 排名与原始分保留、两路查询体（权重、IK、kNN 参数、字段裁剪、topK 上限）、查询失败返回 []、
  无向量只走关键词；rerank 请求体与地址、越界下标丢弃、HTTP 错误 / 空结果 / 异常返回 null；
  检索读取配置、rerank 降级、向量化失败；问答编号拼接、引用解析与越界忽略、无引用回退、摘录截断、
  空问题与无命中不调 LLM；缺 `QWEN_RERANK_URL` 启动失败。
- e2e（Embedding / rerank / LLM / ES mock）：未登录 401、缺参与 topK 越界 400、rerank 降级按 RRF 截取、
  问答返回引用的资料、无命中提示。
- 本地真实链路（ES + IK、DashScope Embedding / rerank / qwen-plus）：发布四篇测试文档后，
  「上线前如何做金丝雀或小流量验证？」「新员工第一周要装什么、VPN 连不上找谁」
  「生产出故障是找李明还是找值班经理？」的第一名分别是灰度发布、入职、故障应急文档（rerank 分 0.93 / 0.96 / 0.94）；
  `/ai/chat` 回答区分了故障指挥王芳与发布负责人李明，并标注 `[1]`。
