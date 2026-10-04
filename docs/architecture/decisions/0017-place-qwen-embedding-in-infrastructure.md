# ADR-0017: Place the Qwen Embedding Client in Infrastructure

- Status: Accepted
- Date: 2026-10-04
- Related: [ADR-0016](./0016-use-elasticsearch-for-rag-chunks.md)
- Supersedes: ADR-0016 module-placement bullet that kept embedding in `src/modules/pipeline`

## Context

ADR-0016 chose Elasticsearch `kh_chunk` and 通义千问 embeddings. The embedding client is a
vendor HTTP wrapper (`OpenAIEmbeddings` against DashScope), configured from process env
(`QWEN_LLM_API_KEY`, `EMBEDDINGS_MODEL_NAME`, dimension, batch size). Retrieval will need the
same client to embed queries. Keeping it inside `PipelineModule` would force search to depend
on the publish-time pipeline.

## Decision

- Put the Qwen embedding client in `src/infrastructure/embedding` (`EmbeddingModule` /
  `EmbeddingService`). Callers pass text only; credentials and model stay in the constructor.
- Keep Markdown chunking and RAG orchestration in `src/modules/pipeline`.
- Keep the vendor and index choices of ADR-0016 (DashScope compatible-mode, `kh_chunk`).

## Consequences

- Pipeline imports `EmbeddingModule` the same way it imports Elasticsearch and RabbitMQ.
- Query-time embedding can reuse the client without depending on pipeline internals.

## Alternatives

- Leave `EmbeddingService` in `PipelineModule` until a second caller appears: rejected;
  the client has no document business rules and retrieval is the next consumer.
