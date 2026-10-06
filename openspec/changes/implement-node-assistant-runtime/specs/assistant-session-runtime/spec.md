## Purpose

Define durable Session, Run and Turn behavior, including concurrency, continuation, steering, cancellation, recovery, compaction, forking and atomic settings changes across Runtime replicas.

## ADDED Requirements

### Requirement: CAP-003 Session lifecycle

The Runtime SHALL let an owner create, list, open, rename, archive, unarchive and delete Sessions, SHALL expose current running status, and SHALL preserve user renames against stale automatic-title updates.

#### Scenario: Automatic title races with user rename

- **WHEN** the user changes a Session title after automatic title generation captured its baseline
- **THEN** the stale automatic title does not overwrite the user's title

### Requirement: CAP-004 Backend-owned Run

A Run SHALL remain owned by the Runtime independently of the command request and SSE subscription that created it, and one Session SHALL have at most one active Run unless a future specification explicitly allows otherwise.

The Run state SHALL be exactly one of `Queued`, `Running`, `WaitingForLocalTool`, `WaitingForMcpTool`, `WaitingForHuman`, `Compacting`, `Cancelling`, `Succeeded`, `Failed`, `Cancelled` or `ResultUnknown`. `Succeeded`, `Failed`, `Cancelled` and `ResultUnknown` SHALL be terminal. A Turn SHALL own an ordered sequence of model attempts and tool loops inside one Run and SHALL NOT create an independent active-Run slot.

Only the transition service holding the current resource version and fencing token SHALL change Run state. `Queued` may become `Running` or `Cancelling`; `Running` may enter any Waiting state, `Compacting`, `Cancelling`, or a terminal state; a Waiting state may return to `Running`, become `Cancelling`, or become `Failed`/`ResultUnknown` according to its durable resolution; `Compacting` may return to `Running`, become `Cancelling`, or fail; `Cancelling` may become `Cancelled`, `Failed`, or `ResultUnknown`. No terminal state may transition again.

Each Waiting state SHALL name its sole durable resume authority: a matching local ToolExecution result, remote MCP ToolExecution result, or Interrupt resolution. Recovery SHALL reacquire ownership and continue from durable state without inventing a resume result. Competing completion, stop, timeout and recovery commits SHALL resolve to one legal state and one terminal event.

#### Scenario: Stream subscriber disconnects

- **WHEN** the only SSE subscriber disconnects while a Run is active
- **THEN** the Run continues, waits for a required local capability, or reaches another defined state without being implicitly cancelled

#### Scenario: Concurrent Run is requested

- **WHEN** a second Run is requested for a Session with an active Run
- **THEN** the Runtime rejects it with a stable active-run conflict and creates no second execution

#### Scenario: Local tool result resumes the matching wait

- **WHEN** a Run in `WaitingForLocalTool` receives the valid terminal result for its bound ToolExecution
- **THEN** the transition service commits the result and returns that Run to `Running` exactly once

#### Scenario: Wrong actor attempts to resume a wait

- **WHEN** an interrupt answer or MCP result is submitted for a Run waiting on a different authority
- **THEN** the Runtime rejects the transition and preserves the current state and durable wait

#### Scenario: Stop races with successful completion

- **WHEN** a stop command and final model completion concurrently attempt to finish the same Run version
- **THEN** one legal transition wins through compare-and-set and exactly one terminal event is committed

#### Scenario: Terminal Run receives another transition

- **WHEN** any worker attempts to move a terminal Run back to `Running` or a waiting state
- **THEN** the durable store rejects the transition even if that worker previously owned the Run

### Requirement: CAP-007 Continue and retry separation

The Runtime SHALL distinguish a normal model continuation from a retryable provider failure, a model-visible tool failure and a permanent Run failure, and SHALL apply finite retry limits.

#### Scenario: Provider requests normal continuation

- **WHEN** a model response completes with the product's continuation meaning
- **THEN** the Runtime continues the same Turn without classifying it as an error retry

#### Scenario: Retry budget is exhausted

- **WHEN** retryable provider failures exceed the configured finite policy
- **THEN** the Run ends as failed with diagnostic metadata and does not retry indefinitely

### Requirement: CAP-008 Durable steer

The Runtime SHALL accept idempotent steer commands for an active Run, preserve their order, and consume them only at defined safe execution boundaries.

#### Scenario: Two steer commands arrive during a tool call

- **WHEN** two distinct steer commands are accepted while the Run waits for a tool
- **THEN** both commands remain durable and are delivered in accepted order at the next allowed boundary

### Requirement: CAP-009 Explicit stop

Stopping a Run SHALL be an explicit idempotent command that propagates cancellation to model work, remote tools, local tools and interactive process sessions, and SHALL publish a final observable state or an explicit unknown cancellation result.

#### Scenario: User stops a Run with a local process

- **WHEN** the stop command is accepted while a bound CLI process is running
- **THEN** the Runtime requests process-tree termination and does not report Cancelled until the defined cancellation outcome is known

### Requirement: CAP-017 Durable pending recovery

Pending tool calls, interrupts and graph execution checkpoints SHALL survive Runtime restart and Redis loss through the durable source of truth.

#### Scenario: Redis is cleared during human input wait

- **WHEN** Redis is empty and the Runtime restarts while a Run waits for HITL
- **THEN** the same interrupt can be retrieved and resolved from durable state without recreating the preceding side effect

### Requirement: CAP-018 Context compaction

The Runtime SHALL support automatic and forced compaction, expose compaction state and failure, preserve original durable history, record the covered event boundary and exclude incomplete interactions from stable summaries.

#### Scenario: Forced compaction succeeds

- **WHEN** an owner forces compaction on a stable Session
- **THEN** the Runtime records a compact point with its covered sequence and token metadata while keeping original events available for history and fork

#### Scenario: Compaction is interrupted

- **WHEN** the Runtime fails before committing the compact point
- **THEN** recovery does not expose a half-committed summary as the current compact state

### Requirement: CAP-019 Fork at an exact event

The Runtime SHALL fork a new Session from an exact stable event sequence by transactionally copying the committed PostgreSQL prefix, applicable settings, compaction lineage, context snapshot and checkpoint into an independent owner-scoped Session while excluding later events and pending interactions. It SHALL record source lineage for audit without requiring a shared message DAG.

#### Scenario: Fork before a pending tool

- **WHEN** an owner forks at a stable event preceding a pending tool request
- **THEN** the new Session contains only the stable prefix and has no copy of that pending ToolExecution

#### Scenario: Source Session is deleted after fork

- **WHEN** Session A is forked to B and the owner later deletes A
- **THEN** B retains its copied history, settings, checkpoint and Session-scoped memory, and any artifact blob referenced by B remains available

### Requirement: CAP-019 Revert and edit

The Runtime SHALL provide `Revert to here` and `Revert and edit` separately from Fork. Revert SHALL atomically move the current Session's active head to a selected stable event using version/CAS protection and SHALL prevent an active or stale Run from committing past the new head. Revert and edit SHALL then append the edited user input and start a new Run without creating a new Session.

#### Scenario: User reverts to a stable event

- **WHEN** no conflicting active work remains and the owner reverts the current Session to a stable event
- **THEN** the active projection ends at that event, the Session identity is unchanged and the reverted suffix is not immediately physically destroyed

#### Scenario: User reverts and edits a message

- **WHEN** the owner selects a committed user message, supplies edited content and the expected Session version still matches
- **THEN** the Runtime moves the active head, appends the edited input once and starts one new Run from that state

### Requirement: CAP-020 Versioned settings CAS

Session settings SHALL use versioned compare-and-set behavior so concurrent edits preserve unrelated fields and a result of unknown delivery is not blindly replayed.

#### Scenario: Unrelated setting changed concurrently

- **WHEN** a model edit is retried after another client changed only the Session title
- **THEN** the edit uses the latest title and changes only its intended model fields

### Requirement: CAP-030 Multi-replica fencing

At most the Runtime replica holding the latest valid Run fencing token SHALL commit Run progress, tool results or terminal states.

#### Scenario: Expired owner submits late output

- **WHEN** an old replica submits output after another replica acquired a newer fencing token
- **THEN** the durable store rejects the stale submission and emits no duplicate completed event
