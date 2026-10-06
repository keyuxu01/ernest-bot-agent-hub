## 1. Architecture, baseline, and delivery gates

- [x] 1.1 Record the fixed Kodex baseline `3008a6de9f178cda7cd63123a0261d75013f772d`, checkout cleanliness, audit date, and BuildKodex gitlink drift in the capability ledger; verify the recorded SHA with `git -C /Users/temptrip/Desktop/Project/Kodex rev-parse HEAD` and `git status --short`.
- [x] 1.2 Add accepted or superseding ADRs for the three deployable boundaries, PG/Redis/Mem0 responsibilities, durable Run/event/checkpoint model, Local Tool Gateway, Deep Agents adapter, and Ink client; verify every architecture decision in `design.md` is either decided by an ADR or explicitly inherited from an existing ADR.
- [x] 1.3 Add a CAP-to-requirement-to-task traceability table for CAP-001 through CAP-032 to the companion ledger; verify a script or test reports no missing, duplicated, or unknown CAP ID.
- [x] 1.4 Define the Capability Auditor start/end template, evidence receipt format, and status promotion rules in repository documentation; verify an independent auditor can reproduce the current `Specified` decision without relying on chat history.
- [x] 1.5 Run `openspec validate implement-node-assistant-runtime --type change --strict --json`, formatting, and link checks; verify the change is valid before any production implementation task is marked complete.

## 2. Workspace and service foundation

- [x] 2.1 Audit the existing `assistant-runtime-service`, `assistant-cli`, workspace packages, CommonJS settings, and dirty worktree; verify a written inventory distinguishes pre-existing user work from this change.
- [x] 2.2 Scaffold `apps/user-platform-service` with the repository NestJS conventions, composition-only `AppModule`, configuration validation, health endpoints, and CommonJS output; verify build, typecheck, lint, and a bootstrap test pass.
- [x] 2.3 Refactor `apps/assistant-runtime-service` from the ping/echo scaffold into feature-module, application, domain, and infrastructure boundaries without changing behavior; verify the existing diagnostic contract tests still pass.
- [x] 2.4 Refactor `apps/assistant-cli` into transport, projection/reducer, credential, local-capability, and Ink presentation boundaries; verify its diagnostic command still runs in both TTY and non-TTY test harnesses.
- [x] 2.5 Add environment schemas for UserPlatform, Runtime, CLI, PostgreSQL, Redis, managed Mem0 Platform, object storage, encryption, model providers, MCP, leases, and limits; remove the scaffolded self-hosted Mem0 mode from this release and verify startup rejects it plus every missing required setting with actionable redacted errors.
- [x] 2.6 Add correlation-context propagation and stable version/build metadata to both services and the CLI; verify one diagnostic request returns the same correlation ID across structured test logs.

## 3. Shared Assistant protocol contracts

- [x] 3.1 Define versioned identifiers, timestamps, pagination cursors, command metadata, resource versions, retry classifications, and safe error envelopes in `@repo/contracts`; verify Zod accepts valid fixtures and rejects malformed/unknown-version fixtures.
- [x] 3.2 Define `UserPlatform*` OAuth, allowlist and five-minute asymmetric token schemas for CAP-001, including fixed algorithm, key ID, issuer, Runtime audience, subject and expiry; verify contract tests cover success, denial, wrong audience, expiration and redaction without Nest TCP, immediate revocation infrastructure or per-request introspection.
- [x] 3.3 Define `AssistantRuntimeSession*`, Run, Turn, model-attempt, command, settings, compact, fork, revert, and revert-and-edit schemas for CAP-003/004/007/008/009/018/019/020/030; verify discriminated unions are exhaustive at compile time and runtime.
- [x] 3.4 Define versioned durable event and SSE frame schemas for CAP-005/006, including heartbeat separation, sequence, payload version, usage, interrupt, tool, artifact, and terminal events; verify replay fixtures round-trip without provider-specific fields.
- [x] 3.5 Define user-owned provider connection, free-form model, optional reasoning/service-tier, model catalog, context snapshot, Mem0 operation, hook, and normalized usage schemas for CAP-010/021/023/024/028; verify unsupported capabilities and unavailable usage remain explicit states.
- [x] 3.6 Define HTTPS-only remote MCP, client binding, Local Tool Gateway, process, coding tool, HITL, and true SubAgent schemas for CAP-011 through CAP-016; verify request/result pairs require execution identity, attempt, binding, request hash, and fencing token where applicable, and no suggested-Session or stdio-MCP schema remains.
- [x] 3.7 Define artifact/image metadata, authenticated retrieval, deletion receipt, audit, health, and readiness schemas for CAP-025/029/031/032; verify secrets and raw protected content have no serializable public field.
- [x] 3.8 Generate and store compatibility fixtures for the CLI and both services, then run consumer/producer contract tests in CI; verify independently built packages parse the same fixtures.

## 4. PostgreSQL durable model and migrations

- [x] 4.1 Add forward migrations for Assistant identity, access grants, Sessions, settings, commands, Runs, Turns, model attempts, and steer commands; verify migration up/down-or-roll-forward tests on a clean PostgreSQL database.
- [x] 4.2 Add migrations for events, outbox, checkpoints, compactions, tools, interrupts, artifacts, context snapshots, MCP connections, client bindings, memory operations, deletion receipts, and audit records; verify all foreign keys, owner columns, versions, and lifecycle states exist.
- [x] 4.3 Add unique and partial constraints for Google subject, command idempotency, Session sequence, event identity, one active Run per Session, one terminal tool result per attempt, interrupt resolution, and current lease epoch; verify representative conflicting inserts fail.
- [x] 4.4 Implement owner-scoped repositories and transaction ports without a global unscoped product query path; verify two-owner integration tests cannot read or mutate each other's rows by guessed ID.
- [x] 4.5 Implement atomic Session sequence allocation, event append, aggregate transition, checkpoint reference, and outbox insertion; verify concurrent writers produce gap-free unique committed sequences or retry safely.
- [x] 4.6 Implement idempotent command recording keyed by owner and command ID plus request hash; verify identical retries return the recorded outcome and changed payload reuse returns a conflict.
- [x] 4.7 Implement outbox claiming, completion, retry, poison handling, and diagnostics; verify worker crash between claim and completion causes safe redelivery without duplicate domain completion.
- [x] 4.8 Add representative production-volume indexes and query plans for Session catalog, history pagination, active Runs, expired leases, pending tools/interrupts, and outbox work; verify integration benchmarks stay within documented bounds.
- [ ] 4.9 Add backup/restore and migration compatibility fixtures for all durable aggregates; verify a pre-change database can migrate forward and a restored snapshot passes invariant checks.

## 5. Identity, authentication, ownership, and secrets

- [ ] 5.1 Implement Assistant-only user admission and administration with unique Google subject, normalized email, enabled state, and an administrative record version; verify CAP-001 integration tests cover add, disable, re-enable, and non-member denial.
- [ ] 5.2 Implement OAuth Authorization Code + PKCE initiation, state/nonce validation, loopback-compatible callback, and Google identity verification; verify forged state, reused code, wrong redirect, and missing PKCE are rejected.
- [ ] 5.3 Implement five-minute asymmetrically signed Assistant access grants and signing-key rotation; verify disabling a user blocks issuance/refresh and existing API/SSE access ends no later than expiry.
- [ ] 5.4 Implement Runtime bearer verification from a configured public-key set without importing login or user-administration behavior; verify Runtime cannot issue grants, makes no per-request UserPlatform call, and rejects missing-subject, invalid-signature, expired, wrong-issuer and wrong-audience tokens.
- [ ] 5.5 Implement reusable owner/resource policies for Session, Run, event, fork, artifact, MCP, settings, Mem0, interrupt, and client-binding operations; verify foreign and unknown IDs produce indistinguishable safe errors.
- [ ] 5.6 Implement encryption and secret-reference adapters for OAuth, provider, MCP, checkpoint, and signing material with key IDs and rotation; verify persistence/log/API snapshots contain no plaintext test secret.
- [ ] 5.7 Add authentication rate limits, security headers, callback restrictions, token-safe logging, and token-expiry-driven stream closure; verify the security negative suite and log redaction snapshots pass.

## 6. Session catalog, settings, fork, and deletion

- [ ] 6.1 Implement owner-scoped create/list/open/rename/archive/unarchive Session use cases with stable cursor pagination and version responses; verify CAP-003 lifecycle E2E including empty and large catalogs.
- [ ] 6.2 Implement automatic title generation as a version-checked auxiliary model operation; verify a stale generated title cannot overwrite a later user rename.
- [ ] 6.3 Implement versioned, field-aware Session/settings CAS and conflict envelopes; verify concurrent unrelated edits merge through refetch/reapply while stale same-field edits conflict.
- [ ] 6.4 Implement fork-at-stable-sequence by transactionally copying the committed PostgreSQL prefix, settings, compact/context/checkpoint state and Session-scoped memories into an independent Session while copying artifact references but not blobs; verify later/pending work is excluded and source deletion cannot damage the fork.
- [ ] 6.5 Implement reversible archive and explicit irreversible Session deletion as distinct commands; verify archive does not stop a Run and confirmed delete follows the documented active-Run policy without offering a product restore path.
- [ ] 6.6 Implement the deletion saga across PostgreSQL, object storage references, Redis, Session-scoped Mem0, MCP credentials, and binding metadata with idempotent receipts; verify user-scoped memory and independently forked Sessions survive, referenced blobs remain, partial failure is visible, and retry completes only missing steps.
- [ ] 6.7 Implement retention and audit-minimization policies; verify deletion removes protected content while retaining only allowed non-content decision evidence.
- [ ] 6.8 Implement `Revert to here` and `Revert and edit` with active-head CAS, active-Run arbitration and edited-input idempotency; verify stale workers cannot commit past the new head and the two commands remain distinct from Fork.

## 7. Run state machine and command semantics

- [ ] 7.1 Implement the exhaustive Run/Turn state machine and legal transitions for queued, running, waiting, compacting, cancelling, terminal, and unknown-result states; verify table-driven unit tests reject every illegal transition.
- [ ] 7.2 Implement atomic Run acceptance with the one-active-Run constraint, initial user event, model/settings/context snapshots, command record, and outbox work; verify concurrent starts create exactly one Run.
- [ ] 7.3 Implement durable model attempts and finish-reason normalization that separates normal Continue, retryable provider failure, tool-visible failure, and permanent failure; verify the CAP-007 matrix and finite retry/backoff tests.
- [ ] 7.4 Implement ordered idempotent steer command acceptance and safe-boundary claim; verify concurrent steers during a tool wait are consumed once in acceptance order.
- [ ] 7.5 Implement explicit idempotent stop and cancellation propagation contracts for model, remote MCP, local tools, processes, HITL, and compaction; verify disconnect/CLI exit never invokes stop implicitly.
- [ ] 7.6 Implement final-state arbitration so success, failure, cancellation, and unknown outcomes cannot all commit; verify races between worker completion and stop produce one legal durable terminal result.
- [ ] 7.7 Implement request-independent Run workers and admission backpressure; verify an HTTP request and all SSE clients can disconnect while the worker safely continues or waits.

## 8. Redis projections, leases, fencing, and replayable events

- [ ] 8.1 Implement versioned Redis namespaces, serializers, TTL policy, hot history/window projection, compact-summary projection, and cache invalidation; verify all keys can be deleted and rebuilt from PostgreSQL.
- [ ] 8.2 Implement Run lease acquisition/renewal/release with PostgreSQL-generated fencing epochs; verify an expired worker cannot commit after a new worker acquires a higher epoch.
- [ ] 8.3 Implement outbox-to-Redis fan-out and projector idempotency; verify duplicate and reordered outbox delivery converges to the PostgreSQL projection.
- [ ] 8.4 Implement bounded history queries and stable before/after cursors over durable events; verify large-history pagination has no duplicate or skipped committed identity.
- [ ] 8.5 Implement the replay/live SSE two-read handoff, `Last-Event-ID`/`after`, heartbeat, proxy-buffering headers, authentication, and event schema versions; verify reconnect at every sequence produces the complete ordered suffix.
- [ ] 8.6 Implement per-subscriber byte/event buffers and resumable slow-consumer closure; verify a blocked subscriber is disconnected without blocking Run execution or dropping durable events.
- [ ] 8.7 Add Redis-loss, Pub/Sub-loss, duplicate-frame, sequence-gap, runtime-restart, and two-replica failure tests; verify PostgreSQL history repairs every reconstructable state.

## 9. Model catalog, harness, checkpoints, and recovery

- [ ] 9.1 Add pinned Deep Agents/LangGraph.js and provider-adapter dependencies behind `AssistantHarness`, `AssistantCheckpointer`, and `AssistantModelProvider` ports; verify no framework type appears in public contracts or core domain APIs.
- [ ] 9.2 Implement owner-scoped provider connection creation from CLI-supplied public HTTPS base URL, masked API key and free-form model, plus optional reasoning effort/service tier; encrypt the key in PostgreSQL, store only references in Session/Run state, and verify exact-model tests plus DNS/redirect/actual-connect SSRF revalidation before credentials, revocation and Redis/plaintext absence.
- [ ] 9.2a Implement a versioned capability catalog for at least two provider classes with context/output limits, tools, images, reasoning, streaming, usage, cache/service tier, and finish mapping; verify catalog refresh and disabled-model tests.
- [ ] 9.3 Implement pre-Run capability validation and explicit optional degradation records; verify a tool-required Session cannot silently start on a model without compatible tool calling.
- [ ] 9.4 Implement normalized streaming, model attempts, abort propagation, provider correlation, and usage capture in the harness adapter; verify provider fakes produce the same product event vocabulary.
- [ ] 9.5 Implement encrypted PostgreSQL LangGraph checkpoints with Run version and last product sequence; verify checkpoint serialization, restore, and incompatibility detection across restart.
- [ ] 9.6 Implement reconciliation for checkpoint/product-event mismatch and quarantine impossible states; verify injected crashes before and after each commit boundary never expose a false completed event.
- [ ] 9.7 Implement expired-lease recovery that reconciles side effects before acquiring a higher fence and resuming; verify model, tool, HITL, and compaction recovery cases after Redis flush.
- [ ] 9.8 Implement `ResultUnknown` classification and manual resolution for non-idempotent external effects; verify recovery never blindly repeats an unsafe unknown operation.

## 10. Context snapshot, compaction, memory, hooks, and usage

- [ ] 10.1 Implement CLI hierarchical AGENTS discovery and explicit Skill loading under canonical workspace confinement; verify precedence, missing files, traversal, and symlink-escape fixtures for CAP-021.
- [ ] 10.2 Implement immutable context-manifest upload, hashing, trust metadata, artifact offload, Turn binding, and Runtime validation; verify changed local files do not alter an accepted Run, recovery, or fork snapshot.
- [ ] 10.3 Implement model-aware prompt assembly and context-budget accounting across system policy, tool catalog, context snapshot, compact window, Mem0 facts, and current input; verify deterministic budget fixtures and over-budget behavior.
- [ ] 10.4 Implement automatic and forced compaction with covered sequence, retained invariants, token metadata, original-history preservation, and atomic activation; verify pending interactions are excluded and interrupted compaction leaves the prior view active.
- [ ] 10.5 Implement the Mem0 Platform adapter behind the internal memory port with owner-scoped and Session-scoped recall, finite timeout, provenance and temporary prompt injection; verify recalled facts are never appended as conversation messages or Redis history, Session facts copy independently on Fork, and no Mem0 OSS runtime is required.
- [ ] 10.6 Implement post-Turn memory extraction, information-gain and prohibited-content filtering, deduplication, owner inspection, correction, deletion, idempotent retry, and durable compensation status; verify credentials, raw transcripts, complete code/patch/shell/tool output never reach Mem0, greetings/repetitions create no duplicate, and outage cannot fail a completed Turn.
- [ ] 10.7 Record the fixed-baseline `NoOpKodexHooks` production wiring, then implement versioned ordered `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `PreCompact`, `PostCompact`, and `UnhandledError` Hook snapshots through the exact Local Tool Gateway binding with timeout, cancellation, output, and durable failure semantics; verify controlling and notification Hook scenario suites without falsely claiming them as Kodex-current wiring.
- [ ] 10.8 Implement provider-reported, estimated, and unavailable normalized usage plus price-version metadata; when an adapter supports account balance/reset, label and preserve provider timestamps, otherwise show Unavailable; verify no charge, top-up, invoice, payment or billing-settlement command/UI exists and missing data never becomes zero.

## 11. Remote MCP and artifact plane

- [ ] 11.1 Implement owner-scoped public-network HTTPS MCP connection CRUD with encrypted credential references and redacted responses; keep the repository-owned development/test MCP service on explicit HTTP localhost while production and user-configured remote MCP reject non-HTTPS targets; reject every stdio configuration and verify another owner cannot observe connection existence or credentials.
- [ ] 11.2 Implement MCP OAuth state/callback/refresh/logout, connection identity, health, reconnect, and failure states; verify refresh revocation blocks execution while retaining safe catalog display metadata.
- [ ] 11.3 Implement versioned MCP catalog discovery, schema snapshots, tool search/delayed exposure, and Run generation binding; verify an accepted ToolExecution retains its original schema after refresh.
- [ ] 11.4 Implement durable remote ToolExecution intent, invocation, structured result, cancellation, timeout, retry classification, and unknown outcome; verify successful, failed, cancelled, and crash-boundary E2E cases against a real test MCP server.
- [ ] 11.5 Implement object-storage-backed artifact creation, content hashing, MIME/size validation, authenticated retrieval, range/stream support, and lifecycle state; verify failed persistence never emits a successful artifact reference.
- [ ] 11.6 Implement image input/view/generation artifact flows and large/binary MCP result offload; verify ownership, supported MIME, limits, rendering metadata, and deletion tests.
- [ ] 11.7 Validate user-configured remote MCP destinations after DNS resolution for the initial request and every redirect or actual connection attempt, always blocking loopback, link-local, private-network and metadata-service addresses in phase 1; separately verify the repository-owned HTTP localhost endpoint is accepted only in development/test and rejected in production, and redirect/DNS-rebinding fixtures cannot reach blocked targets.

## 12. Local Tool Gateway and interactive processes

- [ ] 12.1 Implement CLI instance registration and exact user/workspace/capability/approval-policy binding with canonical path and workspace fingerprint; verify the same user on two devices cannot receive the other's request.
- [ ] 12.2 Implement authenticated binding heartbeat, lease, disconnect, reconnect, and revocation; verify an offline binding remains distinguishable from an unauthorized or replaced binding.
- [ ] 12.3 Implement durable local ToolExecution creation and binding-scoped authenticated SSE dispatch with execution ID, attempt, request hash, binding ID, fencing token and resumable cursor; verify persistence occurs before any CLI observes the request and Session SSE never broadcasts tool arguments or file content.
- [ ] 12.4 Implement CLI acknowledgement, default approval policy, execution, output, and configured-transport result submission plus Runtime CAS acceptance; use HTTP localhost in development/test and HTTPS otherwise, and verify read/search auto-allow, patch diff-before-apply, shell confirmation, explicit Session in-workspace auto mode, and rejection of duplicate, stale-fence, wrong-binding, wrong-workspace, out-of-workspace and conflicting results.
- [ ] 12.5 Implement safe redelivery/takeover policy by tool idempotency class and explicit unknown-result handling; verify disconnect before acknowledgement and disconnect after side effect follow different recovery paths.
- [ ] 12.6 Implement process registry and `exec_command` for PTY/non-PTY launch, bounded stdout/stderr chunks, random scoped handles, exit status, and retained tail output; verify short, long-running, high-output, and non-UTF-8 process fixtures.
- [ ] 12.7 Implement `write_stdin`, terminal resize, polling, backpressure, completion reads, and process-tree termination; verify interactive shell use and Run stop clean up child processes without losing the final known outcome.
- [ ] 12.8 Implement local file read/search, patch, and image-view executors with real-path confinement, optimistic conflict behavior, byte limits, and artifact fallback; verify traversal, symlink escape, patch conflict, and large-result security cases.
- [ ] 12.9 Map web, image generation, plan, and context-budget baseline tools to remote, host, or Runtime implementations and record any approved exclusion; verify CAP-014 has no unmapped fixed-baseline tool.

## 13. HITL and true SubAgents

- [ ] 13.1 Implement durable typed interrupt creation bound to Run, checkpoint, allowed responder, display policy, and resolution version; verify Runtime/Redis restart preserves the exact pending question or approval.
- [ ] 13.2 Implement answer, reject, cancel, and idempotent duplicate resolution commands plus harness resume; verify a conflicting second answer cannot resume the graph twice.
- [ ] 13.3 Implement Ink-side question/approval rendering, secret-input handling, offline queue visibility, and reconnection; verify rejected dangerous work becomes an explicit agent outcome rather than fabricated success.
- [ ] 13.4 Record suggested independent Sessions as an approved baseline exclusion and remove their contracts, UI, tasks and E2E; verify no implementation or acceptance claim aliases them to a SubAgent.
- [ ] 13.5 Implement true SubAgent child-Run identity, lineage, isolated context, inherited-or-narrower owner/workspace/tools/memory/budget, event projection, automatic result return, and cancellation; verify attempted permission expansion is rejected.
- [ ] 13.6 Add concurrent subagent, budget exhaustion, parent stop, child failure, worker crash, and result aggregation tests; verify parent and child histories remain observable and recoverable.

## 14. Ink Session, history, and operation UI

- [ ] 14.1 Implement CLI loopback OAuth, OS credential storage adapter, logout/revocation, token refresh, and noninteractive authentication errors; verify tokens never appear in repository files, process output, or snapshot logs.
- [ ] 14.2 Implement the normalized event reducer with deduplication, gap detection, history merge, pending-command state, reconnect, and schema-version errors; verify deterministic replay fixtures yield the same projection after arbitrary disconnects.
- [ ] 14.3 Implement the complete fixed-baseline history and terminal sidebars, persisted visibility/width and input/newline preferences, plus Session tree/catalog, search/filter, running/archive markers, create/rename/archive/irreversible-delete, context menu, keyboard/mouse navigation and restart restoration; verify large-catalog rendering and CAP-003 workflows in terminal tests.
- [ ] 14.4 Implement virtualized paged history with message, reasoning, plan, tool, interrupt, compact, artifact/image, usage, and subagent renderers; verify large histories stay within documented memory/render bounds.
- [ ] 14.5 Implement composer submit and active-Run steer modes, stop/retry/compact/fork/revert/revert-and-edit commands, pending/unknown feedback, and result reconciliation; verify every operation uses its distinct idempotent command contract.
- [ ] 14.6 Implement provider/model/MCP views with masked API-key entry, public HTTPS base URL, free-form model, optional reasoning/service-tier, capability validation, CAS conflict resolution, connection status, and catalog refresh; verify concurrent edits and unsupported parameters are visible rather than silently ignored.
- [ ] 14.7 Implement workspace/path picker, context snapshot review, patch diff/approval, artifact/image viewer, and interactive terminal pane; verify focus, resize, paste, Unicode width, cancellation, and workspace confinement.
- [ ] 14.8 Implement TTY capability detection and accessible non-TTY/error fallback; verify startup and core diagnostics behave predictably in CI, narrow terminals, and unsupported terminals.
- [ ] 14.9 Replace and remove the ping/echo readline product path only after the Ink acceptance suite passes; verify packaged CLI starts the real Session experience and no production command returns fixed scaffold responses.

## 15. Observability, audit, privacy, and operational controls

- [ ] 15.1 Instrument command, Run, model, MCP, local tool, interrupt, outbox, stream, memory, deletion, and recovery traces with safe correlation identifiers; verify a cross-service failure can be followed without prompt or secret content.
- [ ] 15.2 Add structured redaction allowlists and tests covering authorization headers, OAuth/provider/MCP secrets, prompts, tool output, checkpoints, Mem0 text, local paths, and artifacts; verify forbidden sentinel values never appear in captured logs/traces.
- [ ] 15.3 Add metrics and alerts for admission, active/waiting Runs, lease age, stale fences, outbox lag, event-to-stream latency, reconnect/gaps, retries, unknown effects, tool/HITL wait, compaction, recovery, Mem0 compensation, and deletion; verify metric names and cardinality budgets.
- [ ] 15.4 Implement durable security audit for admission, denial, ownership failure, settings, tool execution, fork, deletion, stale replica, and administrative changes; verify records contain decision metadata but no protected payload.
- [ ] 15.5 Implement liveness, dependency health, command-admission readiness, and worker-readiness endpoints; add a parameterized integration test that disables authentication, ownership, request/stream limits, per-user concurrency budget and model-cost budget one at a time and verifies production readiness is false, then verifies readiness can pass this gate only when all five are active; verify each dependency failure produces the documented degraded state.
- [ ] 15.6 Add rate, concurrency, history/output, artifact, model-token, subagent-budget, and local-process limits with user-safe errors; verify abusive fixtures cannot exhaust a replica or expand permissions.

## 16. End-to-end, failure, migration, and release acceptance

- [ ] 16.0 Treat `acceptance/real-client-e2e.md` as the executable CAP-001 through CAP-032 acceptance matrix and `acceptance/scenario-trace.yaml` as its machine-readable atomic trace manifest; verify every delta-spec Scenario appears exactly once, every atomic and supplemental case resolves through the closed fixture/driver/oracle/cleanup/receipt registries, every product E2E includes packaged-CLI/PTY observation, and all risk/baseline-exclusion cases have sanitized receipts before their CAP can become `Verified`.
- [ ] 16.1 Build hermetic E2E fixtures for Google identity, two model providers, PostgreSQL, Redis, a contract-faithful fake of Mem0 Platform, object storage, remote MCP, two Runtime replicas, and two CLI/workspace bindings; verify the environment can run locally and in CI without production credentials or a self-hosted Mem0 service.
- [ ] 16.2 Start the local UserPlatform and AssistantRuntime test environment over HTTP localhost, then operate the packaged `assistant-cli` as the real client for the complete login-to-Session-to-Run-to-SSE flow, including model output, usage, history paging, reconnect, rename, archive, and automatic title. The CLI E2E suite SHALL also verify production and non-loopback cleartext/downgraded endpoints are rejected before protected data, unauthenticated access, expired token, wrong audience, disabled-user denial for subsequent issuance/refresh, stream closure no later than token expiry, and absence of token/secret values in captured CLI and service logs. Save sanitized commands, environment, exit codes, assertions, and log evidence in the acceptance receipt; direct HTTP/SSE probes are supplementary API integration diagnostics and do not replace this E2E gate.
- [ ] 16.3 Run HTTPS MCP, Local Tool Gateway, patch/file/image, interactive process, HITL, and true SubAgent flows; verify CAP-011 through CAP-016 and CAP-025 relevant scenarios, verify stdio MCP and suggested Sessions are absent, and save artifacts.
- [ ] 16.4 Inject worker, Runtime, CLI, Redis, Mem0, MCP, model, and object-storage failures before/after every documented external-effect boundary; verify recovery, fencing, idempotency, unknown-result, and compensation invariants for CAP-017/022/023/030.
- [ ] 16.5 Run compact, exact-event fork, context-snapshot recovery, settings concurrency, hook, and usage suites; verify CAP-018 through CAP-024 and CAP-028 behavior against immutable history, including supported balance/reset, unsupported Unavailable, provider timestamps and absence of billing actions.
- [ ] 16.6 Run two-user/two-device security tests for API, SSE, artifact, fork, Mem0, MCP, interrupts, local tools, paths, tokens, secrets, audit, and deletion; verify CAP-002/012/021/025/029/031 negative scenarios.
- [ ] 16.7 Rehearse clean install, forward migration, mixed-version compatibility, backup/restore, binary rollback, worker fencing handoff, and roll-forward cleanup; verify CAP-032 has reproducible migration and recovery receipts.
- [ ] 16.8 Run packaged Ink CLI manual acceptance for Session/history navigation, streaming, steer, stop, settings, path, patch, terminal, HITL, subagent, image/artifact, Unicode, resize, keyboard, and mouse behavior; record environment, date, observations, and unresolved limitations.
- [ ] 16.8a Run separately recorded `LIVE-GOOGLE-001`, `LIVE-MODEL-001` and `LIVE-MEM0-001` smoke cases through the packaged CLI; verify real credentials come only from environment or secret management and never appear in commands, output, logs, screenshots, fixtures, or receipts. Missing live credentials produce Blocked/Not-run rather than Pass and cannot be waived by hermetic results for public release.
- [ ] 16.9 Run build, typecheck, lint, unit, integration, contract, E2E, fault-injection, security, migration, and packaging gates for all affected workspaces; verify every command and artifact checksum is captured in the release receipt.
- [ ] 16.10 Have the independent Capability Auditor review code paths, migrations, tests, runtime receipts, baseline differences, and residual risk for every CAP-001 through CAP-032; update the ledger only with evidence-supported status and leave any incomplete item below `Verified`.
- [ ] 16.11 Publish release notes that state exact verified capabilities, exclusions, untested environments, migration/rollback instructions, and known risks; verify approved-target completion is claimed only if all 32 capability entries are `Verified`, and exact/complete Kodex baseline parity is never claimed while Suggested Sessions remain excluded.

## 17. 功能点总验收清单

- [ ] 17.1 Verify CAP-001 through CAP-006: identity admission, resource ownership, Session lifecycle, backend-owned Run/Turn state, durable history, and replayable SSE all have linked production and acceptance evidence.
- [ ] 17.2 Verify CAP-007 through CAP-012: Continue/Retry, steer, stop, model catalog, remote MCP, and exact-client Local Tool Gateway all have linked production and acceptance evidence.
- [ ] 17.3 Verify CAP-013 through CAP-018: interactive processes, coding tools, HITL, subagents, crash recovery, and auditable compaction all have linked production and acceptance evidence.
- [ ] 17.4 Verify CAP-019 through CAP-024: exact-event fork, settings CAS, AGENTS/Skills snapshots, PG/Redis separation, Mem0 lifecycle, and adopted Hook semantics all have linked production and acceptance evidence.
- [ ] 17.5 Verify CAP-025 through CAP-032: artifacts/images, both Ink UI groups, usage, observability/audit, multi-replica correctness, privacy/deletion, and full delivery gates all have linked production and acceptance evidence.
