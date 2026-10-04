# ADR-0016: Use Elasticsearch and Qwen Embeddings for RAG Chunks

- Status: Accepted
- Date: 2026-10-04
- Related: [ADR-0007](./0007-use-rabbitmq.md), [ADR-0013](./0013-use-postgresql-and-mongodb-for-documents.md), [ADR-0017](./0017-place-qwen-embedding-in-infrastructure.md)

## Context

Published documents need a retrieval index that is independent of PostgreSQL metadata and
MongoDB bodies. The first-phase architecture left the vector store undecided. The earlier
knowledge-hub service already indexed Markdown chunks into Elasticsearch `kh_chunk` with a
`dense_vector` field, using a DashScope OpenAI-compatible embedding API.

The embedding vendor is 通义千问, not OpenAI. Environment names such as `OPENAI_API_KEY` or
`EMBEDDING_BASE_URL` hide that fact and collide with future real OpenAI credentials.

## Decision

- Use Elasticsearch 8.x (`kh_chunk`) as the RAG chunk and dense-vector index.
- Embed chunks with 通义千问 through DashScope's OpenAI-compatible endpoint, via LangChain
  `OpenAIEmbeddings` as a client only.
- Name credentials and endpoints after Qwen / DashScope:
  `QWEN_LLM_API_KEY`, `QWEN_CODER_TURBO_MODEL_BASE_URL`, `EMBEDDINGS_MODEL_NAME`.
- Split Markdown with LangChain `RecursiveCharacterTextSplitter`.
- Trigger rebuilds with the RabbitMQ command already required by ADR-0007. The HTTP publish
  path writes `Published` first, then publishes `RagReindexMessageV1`; a failed publish does
  not roll back the document status.
- Keep RabbitMQ and Elasticsearch clients under `src/infrastructure/*`. Keep chunking
  and orchestration in `src/modules/pipeline`. The Qwen embedding client lives in
  `src/infrastructure/embedding`; see [ADR-0017](./0017-place-qwen-embedding-in-infrastructure.md).
  Document feature owns publish
  state and calls the publisher only.
- Treat RabbitMQ and Elasticsearch as required infrastructure, same as PostgreSQL and MongoDB.
  Missing `RABBITMQ_URL` / `ELASTICSEARCH_NODE` or a failed startup handshake abort boot.
  HTTP publish still does not roll back if a later queue publish fails after the document is saved.

## Consequences

- Local Compose already runs Elasticsearch 8.17 and RabbitMQ; the business service now
  consumes both.
- Embedding quality and dimensions follow the Qwen model (`text-embedding-v4`, 1024 dims
  by default). Changing `EMBEDDING_DIMENSION` after an index exists requires recreating
  `kh_chunk`.
- The current process hosts both the HTTP API and the RAG consumer. Splitting them into
  the Railway API / Consumer topology in ADR-0007 remains follow-up work.
- Message envelopes live in `@repo/contracts` as versioned Zod schemas.

## Alternatives

- PGVector in the existing PostgreSQL instance: rejected for this phase because the
  knowledge-hub mapping and kNN path already target Elasticsearch `dense_vector`.
- Call DashScope's native embedding API instead of the OpenAI-compatible client: more
  vendor-specific code for no current gain; rejected.
- OpenAI embeddings: rejected; the project uses 通义千问.

## References

- Elasticsearch dense vector fields
- DashScope compatible-mode API
