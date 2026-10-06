## Context

See [proposal.md](./proposal.md) for the product motivation and scope. The repository currently contains an `assistant-runtime-service` and `assistant-cli`, but they only prove HTTP/SSE ping and echo transport. They do not provide durable execution, identity, ownership, model orchestration, tools, recovery, or the target Ink experience.

The implementation must fit the existing TypeScript/pnpm/Turborepo conventions, keep NestJS applications in CommonJS mode, publish runtime-validated contracts through `@repo/contracts`, and preserve the existing RAG and MCP product boundaries. PostgreSQL, Redis, and Mem0 have deliberately different responsibilities: PostgreSQL owns durable business and execution truth, Redis contains only reconstructable projections and coordination state, and Mem0 contains extracted facts rather than conversations or checkpoints.

The comparison baseline is `/Users/temptrip/Desktop/Project/Kodex` at commit `3008a6de9f178cda7cd63123a0261d75013f772d`, observed on 2026-10-05 on clean `main`. The approved Node target intentionally excludes that baseline's wired Suggested Sessions workflow and therefore does not claim exact parity. The BuildKodex `Kodex/` gitlink points to the unavailable local commit `821b66275aae2f0a9541fa2e9e03023d875c30b5`; it is reference drift, not a second baseline. Changing the comparison baseline or approved exclusion requires a new capability-difference audit rather than editing existing acceptance results.

This is a cross-cutting security and distributed-systems change. A client can cause local code execution, Runs must survive client and server failures, and multiple runtime replicas may race. Consequently, framework defaults are insufficient: command idempotency, ownership, durable events, leases, fencing, side-effect ambiguity, replay, deletion, and evidence promotion are explicit product semantics.

## Goals / Non-Goals

**Goals:**

- Establish one implementation architecture that traces every `CAP-001` through `CAP-032` requirement to modules, persistence, protocols, tests, and acceptance evidence.
- Keep HTTP handlers, SSE connections, CLI processes, and individual runtime replicas stateless with respect to durable Run ownership.
- Make every accepted command and observable completed result recoverable from PostgreSQL, while permitting Redis loss and Mem0 unavailability without corrupting the conversation record.
- Preserve Kodex-current product semantics included in the approved target while replacing Kotlin-, JSON-, and Codex-specific mechanisms with Node components; record Suggested Sessions as an intentional functional divergence.
- Make dangerous local capabilities available only through an authenticated, owner-scoped, workspace-bound CLI connection with explicit approval policy.
- Permit incremental engineering and deployment without calling a partial slice a complete product; the capability ledger is the release truth.

**Non-Goals:**

- Reimplement Kodex source code, its six-timeline JSON format, kRPC, Mosaic UI, or Codex-only Responses protocol.
- Merge Assistant identity or authorization with future RAG RBAC.
- Treat Redis, Mem0, LangGraph checkpoints, or SSE buffers as the conversation/event source of truth.
- Execute workspace tools on the hosted runtime filesystem or expose a directly reachable MCP server from a user workstation.
- Add a web Assistant UI in this change. The contracts may support one later, but Ink is the acceptance client.
- Claim exact or complete Kodex baseline parity while the wired Suggested Sessions capability remains excluded, or claim parity for unwired code unless its `CAP-*` requirement explicitly includes it.

## Decisions

### 1. Use three deployable boundaries and a shared contract package

`apps/user-platform-service` owns Google OAuth, the Assistant allowlist, token issuance, token revocation, and identity administration. `apps/assistant-runtime-service` owns Assistant resources and execution. `apps/assistant-cli` is an Ink client and local capability host. `packages/contracts` owns versioned Zod wire schemas; it contains no service logic.

In development and test, the CLI calls the monorepo's UserPlatform and AssistantRuntime directly over HTTP/HTTP+SSE localhost. Production and every non-loopback endpoint require HTTPS/HTTPS+SSE. The CLI carries a five-minute asymmetrically signed token; Runtime verifies the configured public-key set, fixed algorithm, issuer, audience, subject and expiry locally, so ordinary Runtime requests do not synchronously depend on UserPlatform. Disabling a user immediately blocks issuance and refresh; existing access and streams end no later than expiry. Nest TCP, token introspection on every request, local TLS, service mesh, mTLS and a revocation message bus are outside this change.

Within each Nest application, controllers translate transport concerns, application services implement use cases, domain code owns state transitions and invariants, and infrastructure adapters implement PostgreSQL, Redis, Mem0, model, MCP, object-storage, and token-provider interfaces. `AppModule` composes modules and does not accumulate business logic. Feature modules may depend on infrastructure ports; infrastructure adapters must not import controllers.

The runtime is split into feature modules for access, sessions, runs, events, streams, models, context, memory, remote MCP, local tools, interrupts, artifacts, settings, usage, audit, and recovery. This makes ownership and recovery tests possible without one global agent service.

Alternatives considered:

- One Nest application for login and execution was rejected because it couples the thin Assistant allowlist to a privileged execution service and makes independent token/key rotation harder.
- Putting shared domain classes into `packages/contracts` was rejected because it would turn a wire-schema package into a distributed monolith.
- Adding the Assistant to the RAG business service was rejected because Assistant Sessions, execution authority, and security policy are a separate bounded context.

### 2. Use versioned Zod commands, resources, and events as the protocol boundary

Every mutating HTTP command carries a caller-generated `commandId`, an expected resource version where concurrency matters, and a versioned request schema. Successful commands return a durable resource/version reference rather than relying on the SSE response. Errors use a stable envelope with code, retry classification, correlation ID, and safe details.

SSE frames contain `schemaVersion`, `eventId`, `sessionId`, `sequence`, `type`, `occurredAt`, and a discriminated payload. Heartbeats are transport comments or a distinct non-durable frame and never consume a business sequence. Clients persist the last applied sequence per Session, ignore duplicate event IDs, and detect gaps.

Breaking payload changes introduce a new schema version and an upcaster at history-read boundaries. The database retains the original payload plus its version so old evidence remains auditable.

Alternatives considered:

- Sharing TypeScript types without runtime validation was rejected because CLI and services deploy independently.
- Treating provider stream chunks as the public protocol was rejected because providers disagree on tool, reasoning, finish, and usage semantics.
- WebSocket-only transport was rejected because command submission is request/response and the required server-to-client stream benefits from standard SSE reconnect/cursor behavior.

### 3. Model durable execution explicitly in PostgreSQL

The initial relational model contains:

| Aggregate/table                              | Key invariants                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `assistant_user`                             | Unique Google `sub`; normalized email; enabled state and administrative record version; no RAG roles |
| `assistant_access_grant`                     | Hashed token/session identifier, issuance and expiry; disabled users receive no new grant            |
| `assistant_session`                          | Owner, title, archive/delete state, monotonically increasing aggregate version                       |
| `assistant_run`                              | Session owner, Run state, active lease epoch, model/settings/context snapshots, terminal outcome     |
| `assistant_turn` / `assistant_model_attempt` | Ordered Turn attempts, continuation/retry classification, provider correlation and usage             |
| `assistant_event`                            | Unique `(session_id, sequence)` and `event_id`; append-only versioned payload                        |
| `assistant_command`                          | Unique `(owner_id, command_id)`; request hash; accepted/result state                                 |
| `assistant_steer_command`                    | Ordered, durable, atomically claimed once at a legal safe boundary                                   |
| `assistant_tool_execution`                   | Tool location, binding, attempt, fencing token, idempotency and known/unknown result                 |
| `assistant_interrupt`                        | Durable question/approval payload, checkpoint binding, single resolution version                     |
| `assistant_checkpoint`                       | Run/thread/checkpoint version and encrypted/compressed LangGraph state                               |
| `assistant_compaction`                       | Covered sequence range, summary event, model/budget metadata and status                              |
| `assistant_artifact`                         | Owner, content hash, MIME, byte size, storage key, lifecycle/deletion state                          |
| `assistant_settings`                         | User/session scope, schema version, CAS version and encrypted secret references                      |
| `assistant_client_binding`                   | Exact CLI instance, user, workspace identity, capabilities, lease epoch and liveness                 |
| `assistant_mcp_connection`                   | Owner, non-secret config, encrypted secret references, catalog generation and status                 |
| `assistant_context_snapshot`                 | AGENTS/skill paths, hashes, serialized content/artifact references and trust metadata                |
| `assistant_memory_operation`                 | Mem0 extraction/update/delete intent, source references, idempotency and compensation state          |
| `assistant_outbox`                           | Transactional projection/event work with unique topic and aggregate sequence                         |
| `assistant_audit_record`                     | Actor, action, target, decision, correlation and redacted metadata                                   |

Sequence allocation and event append occur under a Session row lock or equivalent compare-and-swap transaction. A state transition, its domain event, checkpoint reference, and outbox work are committed at one documented boundary. External side effects cannot participate in that transaction; they are represented as intents before dispatch and reconciled afterward.

Rows use soft lifecycle states where deletion spans external systems. Hard deletion is an asynchronous, owner-scoped workflow with per-store receipts. Audit retention stores identifiers and decisions but not deleted prompts, tool output, secrets, or artifact content.

Alternatives considered:

- A generic event store for every aggregate was rejected as unnecessary. Events are append-only product history, while resources still use ordinary relational state and versions.
- Storing only LangGraph checkpoint blobs was rejected because they cannot support stable history, ownership queries, audit, deletion, or protocol evolution.
- MongoDB was rejected for execution state because this repository already uses PostgreSQL for transactional facts and the design requires relational uniqueness/CAS constraints.

### 4. Separate accepted commands, side-effect intents, and observed results

Command handlers first validate authentication, ownership, expected version, and command legality. They then atomically record the idempotent command, state change, event, and outbox item. Workers claim outbox work with database locking, publish it, and mark completion. Repeating the same `commandId` with the same request returns the recorded outcome; reusing it with a different request hash is a conflict.

Provider calls, remote MCP calls, and local tools have stable execution IDs and attempts. Before invocation, the runtime records the intent. After invocation, it records the result and domain event. If a worker dies between the external side effect and result commit, the execution becomes `ResultUnknown` unless the adapter's idempotency key can safely recover it. The runtime never silently replays a non-idempotent unknown operation.

Alternatives considered:

- Holding a database transaction open across model/tool I/O was rejected because it creates long locks and still cannot atomically commit a remote side effect.
- At-least-once replay of every tool was rejected because shell, patch, OAuth, and arbitrary MCP operations may be non-idempotent.

### 5. Use Redis only for reconstructable hot state and coordination

Redis namespaces are versioned and environment-prefixed. They contain Session hot windows, compact-summary projections, model/catalog cache, rate-limit counters, SSE fan-out, CLI presence, and expiring Run/worker leases. They never contain the only copy of a user message, checkpoint, tool result, interrupt, or command outcome.

Runtime configuration uses a validated `REDIS_URL` plus explicit key-prefix, hot-state TTL, lease TTL and command-timeout settings. PostgreSQL uses the repository's existing host/port/user/password/database variables plus an Assistant-owned schema and per-replica pool size. Phase 1 fixes Mem0 to the managed Platform with an API key; top-K, timeout, extraction switch and stable Agent scope are configured, while owner and Session/run scopes always come from authenticated resources rather than global environment variables. A narrow internal `AssistantMemory` port keeps provider types out of the domain, but only the Platform adapter is implemented and accepted in this change.

A Run lease contains `runId`, `ownerReplicaId`, and a monotonically increasing fencing epoch obtained from PostgreSQL. Every worker write that depends on ownership supplies the epoch; stale epochs are rejected by a database predicate. Lease renewal failure stops new work and moves the worker into reconciliation rather than letting it commit late results. Redis Pub/Sub loss is repaired from the PostgreSQL event cursor.

Alternatives considered:

- Redis Streams as the durable execution log was rejected because PostgreSQL remains the authoritative transactional boundary.
- A distributed lock without fencing was rejected because an expired owner can continue running and overwrite a newer owner.
- RabbitMQ was not chosen for Run ownership or event truth; the outbox/worker model is sufficient here and avoids adding a second authoritative queue.

### 6. Run Deep Agents behind a product-owned execution adapter

The runtime wraps Deep Agents/LangGraph behind an `AssistantHarness` port. The adapter translates product snapshots into harness input and translates graph events into product events. Product services—not LangGraph—own Session/Run state, authorization, command idempotency, event sequence, tool execution records, interrupt records, compact points, and cancellation.

The LangGraph thread identifier is derived from the Run, and the PostgreSQL checkpointer stores encrypted durable state. Checkpoint metadata includes Run version and last committed product sequence. Recovery compares these versions before resuming. A checkpoint ahead of committed product state or a product event ahead of the referenced checkpoint is quarantined for reconciliation rather than guessed.

Continuation is a normal model outcome and opens another model attempt without consuming the retry budget. Retryable provider failures use bounded exponential backoff with jitter and persisted attempt metadata. Tool failures are model-visible results unless the product policy classifies them as infrastructure failure. Permanent failures terminate the Run with a durable reason.

Alternatives considered:

- Exposing LangGraph events and `Command` directly to clients was rejected because steer, HITL resume, and retry have different product semantics.
- Building a second handwritten agent loop was rejected because Deep Agents supplies the desired harness primitives.
- Using an AI SDK agent loop around Deep Agents was rejected because two loops would disagree on tools, interrupts, streaming, and usage.

### 7. Make Run ownership independent of request and connection lifetimes

HTTP creates commands; a Run worker executes accepted work. SSE only observes committed events. Closing SSE, exiting the CLI, or losing a network connection does not stop a Run. `stop` is a separate idempotent command that transitions the Run to `Cancelling`, invalidates future work, and propagates an abort signal to model, MCP, local-tool, and process adapters.

The Run state machine is centralized in a transition service and enforced by tests plus database version predicates. At most one non-terminal active Run exists per Session using a partial unique index or transactional constraint. Waiting states explicitly identify what can resume them. Recovery workers scan expired leases and non-terminal Runs, reconcile side effects, acquire a higher fencing epoch, and continue only from a proven checkpoint.

Alternatives considered:

- Executing the whole Run inside the create HTTP request was rejected because disconnects and proxy timeouts would own product lifecycle.
- Treating an SSE subscription cancellation as Run cancellation was rejected because users may reconnect from another client.

### 8. Replay from PostgreSQL before joining live fan-out

On stream connect, the service validates the bearer token and Session owner, captures a high-water sequence, reads all durable events after the supplied cursor through that boundary, subscribes to Redis fan-out, rereads any boundary gap, and then emits live events. This two-read handoff prevents loss between replay and subscription. Duplicate events are allowed and identified; sequence gaps are not.

History and replay are windowed with byte/event limits. A slow consumer is disconnected with its last durable cursor rather than allowed to exhaust server memory. The client reconnects with `Last-Event-ID` or an explicit `after` sequence. Proxy buffering is disabled and heartbeat cadence is configurable.

Alternatives considered:

- Replaying only a Redis buffer was rejected because it cannot survive eviction or restart.
- Publishing uncommitted provider deltas as stable events was rejected because clients could observe text the product cannot recover. Ephemeral deltas may be sent only with an explicit unstable type and are followed by a committed replacement; the default implementation persists bounded text deltas before publication.

### 9. Route local capability through a durable, exact-client gateway

Each CLI installation has a random instance ID and registers a workspace binding using a canonical path, workspace fingerprint, declared capabilities, approval policy version, and ephemeral connection. The Runtime creates `assistant_tool_execution` before dispatch, targets one binding, and emits the request over a binding-scoped authenticated SSE stream that is separate from the Session presentation stream. The CLI acknowledges receipt, verifies user, binding, workspace root, fencing token, tool schema, and approval policy, then posts chunks and the terminal result over the configured service transport: HTTP localhost in development/test and HTTPS otherwise. Tool arguments and local file contents are never broadcast through a Session stream.

Results are posted with execution ID, attempt, request hash, binding ID, and fencing token. The runtime accepts exactly one matching result through CAS. A disconnected CLI leaves the execution waiting until its lease expires; reassignment is allowed only for operations classified safe-to-retry. Otherwise the result is `Unknown` and requires user resolution.

The CLI owns process handles and process trees. Handles are unguessable and scoped to one binding and ToolExecution. `exec_command`, `write_stdin`, resize, output chunks, termination, and final tail retrieval are separate typed operations. Output is bounded and overflow is stored as an owned artifact.

Path tools resolve real paths under the approved workspace root, reject traversal and symlink escape, and do not broaden access because the runtime requested it. Patch application is optimistic and reports conflicts rather than overwriting changed content.

The default approval policy automatically permits reads and searches inside the bound workspace, renders a diff before applying an in-workspace patch without requiring a second confirmation, and requires confirmation for shell execution. A user may explicitly enable automatic execution for the current Session inside that same workspace. No approval mode permits access outside the canonical workspace root.

Alternatives considered:

- Having the runtime execute against its own filesystem was rejected because it is not the user's workspace and greatly expands blast radius.
- Connecting directly to an inbound MCP server on the workstation was rejected because NAT, identity, routing, and revocation are unreliable.
- Assigning work to any online CLI for the user was rejected because device and workspace identity are part of authorization.

### 10. Manage HTTPS MCP separately from local tools

Runtime MCP connections are keyed by owner plus connection ID. The repository-owned `mcp-app-collections` service uses `http://localhost:9021` in development and test; this cleartext exception is limited to loopback and is invalid in production. Users may configure remote MCP endpoints only through public HTTPS. Runtime rejects unsafe remote URLs and loopback, link-local, private-network or metadata-service destinations after DNS resolution for the initial request, every redirect and the actual connection. Server-side stdio MCP and workstation stdio MCP are unsupported in this change. Credentials are encrypted through the repository secret provider; API responses and events return references or redacted metadata only. Catalog snapshots have generations. A Run snapshots the catalog generation it uses, while refresh creates a new generation without mutating history.

OAuth login, callback, refresh, logout, connection health, catalog discovery, and tool invocation are explicit operations. A refresh failure may retain the last known catalog for display but blocks execution when authorization is invalid. Large or binary tool results become artifacts.

Alternatives considered:

- Combining remote MCP and Local Tool Gateway into one transport was rejected because their trust, liveness, and execution owners differ.
- Storing raw MCP credentials in settings JSON was rejected because settings are routinely returned and audited.

### 11. Build context from immutable snapshots and distinct memory layers

At Run acceptance, the CLI supplies a candidate workspace-context manifest. The runtime records canonical paths, hashes, trust classification, content/artifact references, selected explicit skills, and resolution order as an immutable context snapshot. The CLI performs hierarchical AGENTS/skill discovery inside the approved workspace; the runtime treats discovered content as untrusted instructions and never as new authorization.

Prompt assembly uses: product system policy, authorized tool/catalog snapshot, immutable AGENTS/skill snapshot, compacted PG history window, Mem0 recalled facts, and current Turn input. It stores source references and budget accounting, not hidden secrets. Fork and recovery reuse the original snapshots unless the user explicitly refreshes them through a versioned command.

Mem0 keys are owner-scoped and optionally Session-scoped. Retrieval is temporary context, not a human/assistant event. After a completed Turn, a background operation extracts candidate facts with source event IDs, applies deduplication/update policy, and records its outcome. Only reusable preferences, stable project conventions, explicitly requested memories and other filtered long-term facts are eligible. Credentials, authentication material, raw conversation transcripts, complete source files, patches, shell output and unprocessed tool results are prohibited. Mem0 failure does not fail the Run; the durable operation can retry. Users can inspect, correct and delete memory, and cross-user retrieval is tested negatively.

The Mem0 OSS source repository is not vendored into the Turborepo and is not a Git submodule. Operating a self-hosted Mem0 REST service would add a Python service, image lifecycle, database migration, backup, availability and upstream-fork maintenance surface; those responsibilities are deferred. A future self-hosted adapter must arrive through a separate OpenSpec change and preserve the same ownership, provenance, deletion, timeout and compensation semantics before it can replace the Platform adapter.

Alternatives considered:

- Reading current workspace files again during recovery was rejected because it changes historical behavior.
- Writing recalled Mem0 text into conversation history was rejected because it creates false user statements and compaction loops.
- Using Mem0 for checkpointing was rejected because extracted facts cannot reconstruct execution.
- Shipping Platform and self-hosted Mem0 adapters in phase 1 was rejected because it doubles integration and operational acceptance before there is production evidence that data residency, volume or cost requires self-hosting.

### 12. Compact, revert and fork over immutable event history

Compaction creates a durable operation with a covered event range, model/catalog snapshot, budget, retained invariants, and summary. Original events remain immutable and queryable. The active context projector selects the newest valid compaction plus later events. Pending tool calls/results, unresolved interrupts, system safety instructions, and required tool pairings cannot be summarized away. Failure leaves the previous projection active.

Fork locks the source Session long enough to validate the target sequence and transactionally copies the committed PostgreSQL history, applicable settings, compact lineage, context snapshots and checkpoint state up to that sequence into a new independent Session. The target records source Session/event lineage for display and audit, but does not query a shared message DAG. Pending tools, interrupts and later output are excluded. User-scoped Mem0 remains user-owned; Session-scoped facts are copied into the target scope and then evolve independently. Artifact reference rows are copied while immutable object-storage blobs are shared until their last reference is removed.

`Revert to here` keeps the same Session identity and atomically moves its active history head to the selected stable event after cancelling or rejecting conflicting active work. `Revert and edit` performs the same guarded rewind, appends the edited user input and starts a new Run. Reverted suffix data is excluded from the active projection and is not immediately physically destroyed; CAS prevents a stale Run or client from overwriting the new head.

Alternatives considered:

- Replacing old events with a summary was rejected because audit, fork, and recovery require the originals.
- Forking only visible chat messages was rejected because settings, compact lineage, tool results, and context snapshots affect behavior.

### 13. Use user-owned model connections and normalize usage

The CLI collects a user-owned HTTPS base URL, masked API key and free-form model name. It may also collect optional reasoning effort and service tier. Before the initial request, every redirect and every actual model connection attempt, Runtime resolves the destination and rejects non-HTTPS, loopback, link-local, private-network and metadata-service addresses before transmitting the API key. It then tests the exact requested model, encrypts the API key in PostgreSQL and returns a `provider_connection_id`; Redis never stores plaintext credentials. A Session stores that connection reference and default model, while each Run records the effective connection, model and optional parameter snapshot. Changing Session defaults does not mutate an active Run, and revoking a connection prevents new Runs.

Deep Agents receives a configured LangChain model instance rather than raw credential fields. Reasoning effort and service tier are model-client options, not Deep Agents state; they are omitted when unset and unsupported-provider errors are surfaced rather than silently ignored.

Provider adapters publish a normalized model union: context/output limits, streaming, reasoning, tool calling, parallel tool calls, images, usage, cache/service tier, and finish reasons. Catalog entries are versioned snapshots. Run creation validates requested features before execution; unsupported required capability is a visible error, while optional degradation requires an explicit recorded policy.

The selected catalog snapshot drives context budgeting, compaction thresholds, request construction, finish mapping, and usage display. Raw provider usage is retained in protected diagnostic metadata when permitted, while public events expose normalized input/output/reasoning/cache tokens, price version, cost, and an `Unavailable` state rather than zero.

Alternatives considered:

- Hard-coding one OpenAI-compatible model shape was rejected because compatible endpoints often differ in reasoning, usage, image, and tool semantics.
- Inferring capabilities only after provider failure was rejected because it wastes Runs and makes degradation invisible.

### 14. Treat HITL, steer, retry, and SubAgent work as different commands

An interrupt contains a schema, display policy, checkpoint reference, allowed responders, and resolution version. Answer/reject/cancel commands bind to that interrupt and resume only its checkpoint. Duplicate identical resolution returns the original result; a conflicting second resolution fails.

Steer appends user input to an active Run queue and is consumed at an allowed model/tool boundary. It does not call LangGraph interrupt resume. Retry creates a new attempt according to failure classification. Deep Agents SubAgents create child Runs with lineage, isolated context, a bounded budget, result return to the parent, and inherited-or-narrower tools, workspace, memory and cancellation. The product intentionally does not implement Kodex suggested independent Sessions; this is an explicit approved baseline exclusion rather than a SubAgent alias.

Alternatives considered:

- Encoding all four operations as chat messages was rejected because legality, idempotency, ownership, and recovery differ.
- Letting subagents inherit raw parent credentials was rejected because child work must never expand authority.

### 15. Use an Ink application with a reducer/projection architecture

The CLI separates transport, durable local preferences, event projection, local capability execution, and presentation. A single event reducer consumes history pages and SSE frames into normalized Session/Run/Event/Tool/Interrupt/Subagent views. UI components never parse provider payloads or mutate server state optimistically without a pending command record.

The initial layout preserves the fixed Kodex history and terminal sidebars, their complete actions and shortcuts, persisted visibility/width and input/newline preferences, plus Session tree/search/archive state, virtualized paged history, status/usage header, event renderers, composer with active-Run steer mode, stop/retry/compact/fork/revert/revert-and-edit commands, tool/approval/interrupt panels, subagent lineage, provider/model/MCP views, path picker, patch/image/artifact views, and an interactive terminal pane. Focus, keyboard, mouse, resize, paste, Unicode width, restart restoration and non-TTY fallbacks are tested. Pure layout/input preferences remain local to the CLI and never contain credentials.

CLI tokens are stored through an OS credential adapter where available, never in logs or plain repository files. Local preferences may cache navigation and rendering choices but never become Session or Run truth.

Alternatives considered:

- Extending the current readline loop was rejected because it cannot safely host concurrent navigation, streaming, approvals, patch review, and interactive processes.
- Letting UI components call services directly was rejected because replay/reconnect would produce divergent state.

### 16. Enforce ownership, secret, retention, and deletion policy at every adapter

Authentication establishes an Assistant user; authorization still scopes every query and command by owner. Unknown and foreign IDs return the same safe response. Internal workers carry an explicit owner and resource scope rather than bypassing repository filters. Artifact download uses short-lived owner-scoped grants.

OAuth, provider, MCP, and signing secrets use an encryption/key-provider port with key IDs and rotation. Structured logging applies allowlisted fields and redaction before emission. Prompt, tool output, memory text, authorization headers, and checkpoint blobs are excluded by default.

Public command and stream endpoints remain disabled until authentication, per-resource ownership, finite request/stream limits and per-user concurrency/model-cost budgets are active. User-configured remote MCP endpoints reject loopback, link-local and private-network targets after DNS resolution for the initial request and every redirect or actual connection attempt. Phase 1 has no administrator bypass for blocked destinations. These are the phase-1 abuse and SSRF controls; a broader WAF, service mesh or zero-trust platform is not required by this change.

Session deletion is an explicit irreversible action distinct from reversible archive. It is a durable saga spanning PostgreSQL, object storage, Redis projections, Session-scoped Mem0, MCP credentials, and local binding metadata. Forked Sessions remain independent copies. Deletion removes only the target Session's artifact references; a blob is deleted after the last reference is gone. User-scoped Mem0 survives Session deletion, while Session-scoped facts are deleted. Each step is idempotent and has a receipt; partial failure remains visible and retryable. Retention policies distinguish active product data, operational diagnostics, audit decisions, and encrypted backups.

Alternatives considered:

- A global authenticated repository method was rejected because it makes cross-user ID bugs easy.
- Best-effort synchronous deletion was rejected because external stores cannot share a transaction and silent partial deletion violates the contract.

### 17. Make observability correlate product lifecycle without leaking content

Every accepted command receives a correlation ID propagated through Run, model attempt, MCP/local tool, interrupt, outbox, event, and CLI logs. Traces and metrics cover state-transition latency, queue/lease age, event-commit-to-stream latency, reconnect/replay counts, provider attempts, tool/interrupt wait, compaction, recovery, deletion, and Mem0 compensation.

Audit records capture who attempted what, the authorization decision, target class, result class, and policy/version—not prompt content or secrets. Diagnostics expose invariant violations and reconciliation state. Health endpoints distinguish process liveness from dependencies and worker readiness.

Alternatives considered:

- Logging complete prompts and tool payloads for debugging was rejected because the runtime handles source code, secrets, and personal memory.
- A single aggregate health check was rejected because operators need to know whether command acceptance, streaming, and Run execution are safe independently.

### 18. Gate delivery through migrations, fault tests, and the capability ledger

Database changes use forward migrations, compatibility windows, and explicit rollback/roll-forward notes. Unit tests cover pure state machines and reducers; integration tests use real PostgreSQL and Redis; contract tests cover Zod/HTTP/SSE. Product E2E follows [`acceptance/real-client-e2e.md`](./acceptance/real-client-e2e.md): Codex operates the packaged CLI/PTY through UserPlatform, Runtime, storage, model, MCP, Local Tool Gateway, Mem0 and artifact boundaries for every CAP-001 through CAP-032. Direct HTTP/SSE probes are supplementary diagnostics and cannot replace the real-client gate. Fault injection kills workers or disconnects dependencies at every external side-effect boundary.

`docs/architecture/proposals/2026-10-05-node-agent-runtime-capability-ledger.md` is the acceptance ledger. A coding session begins with an auditor subagent reading the OpenSpec, affected tasks, ledger, and current diff. It ends with that subagent independently checking evidence and proposing status changes. Only strict-valid specs promote a capability to `Specified`; only production wiring plus automated evidence promotes it to `Implemented`; only recorded product/fault/manual acceptance promotes it to `Verified`.

No release is called complete until all 32 entries are `Verified`, migration and rollback rehearsals have receipts, the CLI has a real interactive acceptance run, and security/ownership negative suites pass.

Alternatives considered:

- Treating completed task checkboxes as acceptance was rejected because scaffolds and mocks can satisfy tasks without delivering behavior.
- One final big-bang test was rejected because distributed failure boundaries need evidence while they are implemented.

## Risks / Trade-offs

- **[The full product is a large cross-cutting change]** → Keep one mother change for semantic consistency, but execute dependency-ordered slices with independently runnable tests and ledger evidence. Do not advertise partial delivery as approved-target completion, and never advertise exact Kodex parity while Suggested Sessions remain excluded.
- **[Deep Agents or LangGraph APIs may change]** → Isolate them behind `AssistantHarness` and checkpointer ports, pin versions, add adapter contract tests, and avoid leaking framework types into contracts/domain code.
- **[PostgreSQL event writes and checkpoints can diverge]** → Define transaction boundaries, store mutual versions, reconcile on recovery, and quarantine impossible combinations instead of automatically guessing.
- **[External side effects can have unknown results]** → Persist intent before dispatch, use provider idempotency where supported, classify tools, fence results, and require explicit resolution for unsafe unknown operations.
- **[SSE fan-out can duplicate or lose transient delivery]** → Make events durable before publish, use sequence-aware replay, tolerate duplicates, and reconnect slow clients from their durable cursor.
- **[Local code execution has high security impact]** → Require authentication, exact client/workspace binding, real-path confinement, capability/approval policy, unguessable handles, redacted logs, and negative security tests.
- **[A compromised workspace can inject AGENTS/skill instructions]** → Snapshot and label workspace context as untrusted prompt input; never allow it to alter authorization, secret policy, or system safety rules.
- **[Mem0 can return stale, incorrect, or cross-scope facts]** → Store provenance and scope, isolate owner keys, expose correction/deletion, treat recalls as fallible context, and test cross-user isolation.
- **[Large histories and output can exhaust memory or terminals]** → Use byte-bounded pagination, virtualized Ink lists, artifact offload, backpressure, compaction projections, and slow-consumer disconnects.
- **[Token revocation and long SSE connections conflict]** → Phase 1 uses token expiry as the revocation bound: disabling a user stops issuance and refresh, requests validate the short-lived token, and streams close no later than `exp`; no revocation notification channel is introduced.
- **[Fork lineage and deletion retention can conflict]** → Copy the committed Session prefix into an independent target, share only immutable artifact blobs through reference rows, and test source/fork deletion in both orders.
- **[Provider capability/usage metadata may be incomplete]** → Preserve an explicit `Unknown`/`Unavailable` state and prohibit fabricated zero usage or silent capability degradation.
- **[The fixed Kodex baseline can drift from BuildKodex documentation]** → Keep the full SHA and verification date in the ledger; require a separate difference audit before changing it.

## Migration Plan

1. **Architecture and baseline gate**: accept the Node runtime ADR set, record the fixed Kodex SHA, strict-validate this OpenSpec change, and mark only requirements with traceable scenarios as `Specified`.
2. **Compatibility foundation**: add versioned contracts, error envelopes, correlation IDs, configuration validation, database migrations, repository ports, test fixtures, and feature flags while leaving the ping/echo scaffold available only as a non-production diagnostic.
3. **Identity and durable core**: deploy UserPlatform allowlist/OAuth/token validation and runtime access guards; add Session, Run, command, event, outbox, settings, artifact, and audit stores. Backfill is not needed because the current scaffold has no product data.
4. **Execution and recovery**: introduce the model catalog, harness adapter, checkpointer, Run workers, retry/continue/steer/stop, Redis leases/fencing, replayable SSE, recovery/reconciliation, compact, and fork behind disabled product flags.
5. **Tool and context plane**: add remote MCP, Local Tool Gateway, process sessions, coding tools, HITL, subagents, AGENTS/skill snapshots, Mem0, hooks, artifact/image handling, and deletion compensation. Enable each only after ownership and failure tests pass.
6. **Ink replacement**: build the reducer/projection client and all required views alongside the diagnostic CLI. Run protocol replay fixtures, terminal tests, and real loopback OAuth/local-tool acceptance before switching the default executable.
7. **Staged rollout**: enable an internal allowlist, then a small production allowlist. Observe recovery, unknown-result, replay, deletion, and security metrics. Capability statuses advance only with linked receipts.
8. **Completion gate**: run full E2E, failure matrix, migration/restore rehearsal, two-replica tests, Redis-loss recovery, security negative suite, and manual CLI acceptance. Remove the diagnostic ping/echo path and release only when every ledger entry is `Verified`.

Rollback is by feature flag and compatible binary rollback while forward-compatible schema remains. Migrations avoid destructive column removal during the compatibility window. If a Run worker release is rolled back, new command admission is paused, active Runs are allowed to reach a safe checkpoint or are explicitly cancelled, leases expire, and the previous worker acquires a higher fencing epoch. External side-effect or deletion operations in `Unknown`/partial state are reconciled; they are never erased to make rollback appear clean. Schema cleanup occurs only in a later, separately reviewed change after restore and rollback evidence exists.
