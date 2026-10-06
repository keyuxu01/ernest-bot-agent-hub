## Why

Agent Hub needs a production Assistant that implements the approved Node target derived from the fixed Kodex product baseline without importing its Kotlin implementation, Codex-only protocol or local JSON storage. Suggested Sessions are an intentional wired-baseline exclusion, so this change does not claim exact Kodex parity. The existing `assistant-runtime-service` and `assistant-cli` are transport scaffolds only; this change turns the accepted Node stack into a durable, authenticated coding-agent product with explicit recovery and acceptance semantics.

## What Changes

- Add a product-scoped `UserPlatform` authentication boundary using Google OAuth + PKCE, an Assistant-specific allowlist and five-minute access tokens whose revocation bound is expiry.
- Add a NestJS `AssistantRuntime` backed by PostgreSQL durable Session/Run/Event/Tool/Interrupt/Checkpoint records and Redis reconstructable working sets, leases, fencing and stream fan-out.
- Add Deep Agents/LangGraph execution with a model capability catalog, explicit Continue/Retry/steer/stop semantics, compact, HITL, subagents and crash recovery.
- Add replayable, typed SSE and idempotent HTTP commands so client disconnects do not own or cancel backend Runs.
- Add owner-scoped, public-network HTTPS MCP support and a durable Local Tool Gateway that executes workspace-bound coding tools through the exact connected CLI; server-side and workstation stdio MCP are excluded.
- Add AGENTS/Skills snapshots, artifacts, independent-copy fork semantics, `Revert to here`, `Revert and edit`, settings CAS, provider usage and lifecycle/audit events.
- Add user-owned OpenAI-compatible model connections entered through the CLI as HTTPS base URL, API key and free-form model, with optional reasoning effort and service tier. Credentials are encrypted in PostgreSQL, Sessions store only connection references plus model defaults, and every initial, redirected and actual connection is revalidated against public-network SSRF rules before credentials are sent.
- Add Redis + PostgreSQL + managed Mem0 Platform layered memory: PostgreSQL remains the conversation and execution source of truth, Redis is reconstructable hot state, and Mem0 stores only filtered user/session facts rather than credentials, raw conversations, source files, patches or complete tool output. Phase 1 uses the hosted Platform through an internal port; vendoring or operating Mem0 OSS is deferred to a separate change.
- Replace the readline ping/echo client with an Ink console covering Session navigation, history, streaming, tool/HITL/subagent work, settings, workspace paths, patch/image/artifact rendering and interactive processes.
- Add migrations, architecture decisions, fault-injection tests, end-to-end tests and a capability ledger. A capability is complete only when its `CAP-*` entry reaches `Verified`.

## Capabilities

### New Capabilities

- `assistant-access-control`: CAP-001, CAP-002 and CAP-031 — identity admission, per-resource ownership, secret protection, retention and deletion.
- `assistant-session-runtime`: CAP-003, CAP-004, CAP-007 through CAP-009, CAP-017 through CAP-020 and CAP-030 — Session/Run/Turn lifecycle, continuation, retry, steer, stop, recovery, compact, fork, settings concurrency and multi-replica correctness.
- `assistant-event-stream`: CAP-005, CAP-006 and CAP-025 — durable event history, replayable SSE and owned artifacts/images.
- `assistant-model-context-memory`: CAP-010, CAP-021 through CAP-024 and CAP-028 — model catalog, AGENTS/Skills context, PostgreSQL/Redis state, Mem0 memory, hooks and provider usage.
- `assistant-tools-and-collaboration`: CAP-011 through CAP-016 — remote MCP, local tool gateway, interactive processes, coding tools, HITL and subagents.
- `assistant-cli`: CAP-026 and CAP-027 — complete Ink Session/history and operation UI.
- `assistant-observability-delivery`: CAP-029 and CAP-032 — observability, audit, migrations, verification and release evidence.

### Modified Capabilities

None. Existing RAG, typed-business API, frontend state and Railway specifications remain unchanged; Assistant is a parallel product boundary.

## Impact

- Apps: `apps/user-platform-service` (new), `apps/assistant-runtime-service`, `apps/assistant-cli`, and integration with `apps/mcp-app-collections`.
- Shared contracts: new versioned `AssistantRuntime*` and `UserPlatform*` Zod schemas in `packages/contracts`.
- Data: PostgreSQL migrations for Assistant identity, sessions, runs, events, tools, interrupts, checkpoints, artifacts, settings and outbox; Redis namespaces for working sets and coordination; Mem0 user/session scopes.
- Protocols: loopback HTTP between monorepo services in development/test, HTTPS outside localhost, OAuth loopback callback, locally verified five-minute Assistant tokens, authenticated commands, replayable Session and binding streams, public-network HTTPS MCP and the CLI Local Tool Gateway. UserPlatform and Runtime do not require local TLS, Nest TCP, WebSocket, Studio or per-request token introspection.
- Dependencies: Deep Agents/LangGraph.js, LangChain model adapters, PostgreSQL and Redis adapters, the Mem0 Platform client, Ink and supporting terminal libraries. The Mem0 OSS repository is not added to this monorepo or as a submodule.
- Operations: runtime and user-platform deployment configuration, managed Mem0 credentials, secret management, rate limits, tracing, metrics and failure recovery. A self-hosted Mem0 service and its database, image, upgrades, backup and availability are outside this change.
- Documentation: the Node capability plan, companion capability ledger, architecture overview, new or superseding ADRs and this OpenSpec change.
