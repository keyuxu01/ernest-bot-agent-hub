# ADR-0019: Use PostgreSQL for Runtime Truth, Redis for Coordination, and Mem0 for Facts

- Status: Accepted
- Date: 2026-10-05
- Related: [ADR-0008](./0008-use-redis.md), [OpenSpec design](../../../openspec/changes/implement-node-assistant-runtime/design.md)

## Context

Assistant execution must recover Sessions, ordered history, pending tools, human interrupts, and model checkpoints after process restart and Redis loss. It also needs low-latency fan-out and coordination plus cross-Session facts. These data classes have different durability and consistency requirements.

## Decision

- PostgreSQL is the source of truth for identity references, Sessions, Runs, Turns, commands, ordered events, ToolExecutions, interrupts, checkpoints, compactions, settings, artifacts, context snapshots, audit, deletion receipts, and transactional outbox work.
- Observable completed results are committed to PostgreSQL before durable SSE publication. External effects are persisted as intents and may become explicitly `ResultUnknown`; unsafe unknown operations are not blindly replayed.
- Redis stores reconstructable hot windows, compact-summary projections, catalog caches, rate limits, fan-out, presence, and expiring leases. PostgreSQL-issued monotonically increasing fencing epochs prevent stale replicas from committing.
- Mem0 stores only owner-scoped reusable preferences, stable project conventions, explicitly requested memories, and filtered long-term facts with provenance, correction, inspection, and deletion. Recalled facts are temporary model context, not messages or checkpoints.
- Mem0 never stores API keys, tokens, passwords, cookies, OAuth/MCP/model secrets, raw conversation transcripts, complete source files, patches, complete shell output, or unprocessed tool results.
- A Fork transactionally copies committed PostgreSQL history and execution snapshots into an independent Session. User-scoped Mem0 remains shared by owner; Session-scoped facts are copied and then evolve independently. Artifact reference rows are copied while immutable blobs remain shared until their last reference is removed.
- Phase 1 uses managed Mem0 Platform through an internal Runtime port. The Mem0 OSS repository is not vendored into this monorepo or added as a Git submodule, and no self-hosted Mem0 service is operated in this change.
- Self-hosting is deferred to a separate OpenSpec change. It must preserve the same ownership, provenance, deletion, timeout and compensation contract before replacing the Platform adapter.
- LangGraph checkpoints are durable execution state but are not the user-visible event history. Checkpoint and product-event versions are reconciled during recovery.

## Consequences

- Redis may be flushed without losing confirmed product state.
- Mem0 failure may delay memory extraction but cannot roll back a completed Turn.
- Deleting a source Session cannot damage an independent Fork; deletion may remove a blob only after its final artifact reference is gone.
- The first release carries one Mem0 adapter and no Python service, Mem0 image lifecycle, separate Mem0 database migration, backup or availability obligation.
- PostgreSQL migrations, transaction boundaries, outbox processing, reconciliation, and fault injection become required release work.
- Multi-replica correctness relies on database version predicates in addition to expiring Redis leases.

## Alternatives

- Redis as the only Agent state store: rejected because eviction or restart would lose durable work.
- Mem0 as conversation history or checkpoint storage: rejected because extracted facts cannot reconstruct execution.
- Shipping a self-hosted Mem0 service in phase 1: deferred because it adds a second runtime and operational lifecycle before production data residency, cost or scale demonstrates the need.
- LangGraph checkpoint blobs as the only persistence: rejected because they do not provide stable product history, ownership, audit, or deletion semantics.
