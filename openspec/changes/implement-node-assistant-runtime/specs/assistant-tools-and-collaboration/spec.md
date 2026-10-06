## Purpose

Define remote MCP, local coding tools, interactive processes, human interrupts and subagent collaboration with durable identities, workspace isolation and safe recovery across network boundaries.

## ADDED Requirements

### Requirement: CAP-011 Remote MCP lifecycle

The Runtime SHALL manage owner-scoped public-network HTTPS MCP configurations, OAuth state, connection lifecycle, tool-catalog versions and structured tool results without exposing plaintext secrets. It SHALL reject non-HTTPS, loopback, link-local, private-network and metadata-service remote targets after DNS resolution at initial request, redirect and connection time. The repository-owned MCP collection MAY use cleartext HTTP only when `NODE_ENV` is `development` or `test` and its hostname is `localhost`, `127.0.0.1`, or `::1`; production SHALL reject that exception. Server-side and workstation stdio MCP SHALL NOT be supported.

#### Scenario: Developer runs the repository MCP service locally

- **WHEN** Runtime starts in development or test with `MCP_COLLECTIONS_URL=http://localhost:9021`
- **THEN** it accepts the repository-owned MCP endpoint without requiring a local TLS certificate

#### Scenario: Production is configured with a cleartext local MCP endpoint

- **WHEN** Runtime starts in production with an HTTP MCP collection URL, including localhost
- **THEN** startup rejects the configuration before any MCP request is made

#### Scenario: MCP catalog changes during a Run

- **WHEN** an MCP server refresh changes a tool schema after a ToolExecution was accepted
- **THEN** the accepted execution retains its original schema snapshot and later calls use the new catalog version

### Requirement: CAP-012 Local tool dispatch

A local ToolExecution SHALL be durably created before delivery, SHALL target the exact bound CLI and workspace over a binding-scoped authenticated SSE stream, SHALL receive acknowledgement and result through typed service commands (HTTP localhost in development/test and HTTPS otherwise), and SHALL accept at most one valid terminal result for an execution attempt. Local tool arguments and file content SHALL NOT be broadcast over the Session presentation stream.

#### Scenario: CLI disconnects before acknowledging request

- **WHEN** the target CLI disconnects after the request is durable but before execution acknowledgement
- **THEN** the Run remains waiting and the request can be redelivered to the same valid binding without being treated as newly completed

### Requirement: CAP-012 Local path confinement

Every local file operation SHALL resolve canonical paths within the authorized workspace and SHALL reject traversal or symbolic-link escape.

#### Scenario: Patch targets a symlink outside workspace

- **WHEN** a patch path resolves through a symbolic link to a location outside the workspace
- **THEN** the CLI rejects the operation before modifying the target

### Requirement: CAP-012 Local approval policy

The default policy SHALL automatically permit reads and searches inside the bound workspace, SHALL render a diff before applying an in-workspace patch without a second confirmation, and SHALL require confirmation for shell execution. The owner MAY enable automatic in-workspace execution for the current Session. No policy or approval SHALL permit access outside the canonical workspace root.

#### Scenario: Shell command uses the default policy

- **WHEN** a local shell command is requested under the default policy
- **THEN** the Run waits for a durable approval and execution begins only after the bound user approves

#### Scenario: Session enables in-workspace automatic execution

- **WHEN** the owner explicitly enables automatic execution for the current Session and a request remains inside its canonical workspace
- **THEN** the CLI may execute without another prompt while preserving the ToolExecution, audit and result records

### Requirement: CAP-013 Interactive process sessions

The local tool host SHALL support starting a process, streaming bounded stdout/stderr, writing later stdin, observing final output and exit status, and terminating the process tree.

#### Scenario: Process outlives initial command response

- **WHEN** a command remains running beyond the initial output interval
- **THEN** the caller receives a stable process-session identity and can retrieve output or write stdin later

#### Scenario: Run is stopped

- **WHEN** a Run owning an interactive process receives stop
- **THEN** the CLI requests process-tree termination and reports the observed or unknown termination outcome

### Requirement: CAP-014 Coding tool coverage

The product SHALL provide baseline-equivalent patch, command, stdin, file/image view, web, image generation, plan and context-budget behavior for every tool wired into the fixed Kodex baseline. A reference tool may be excluded only when baseline evidence proves it is not wired into that product; an implementation preference or missing Node mapping is not an exclusion.

Every coding tool SHALL have a versioned input/result schema, declared execution location, ownership and workspace policy, bounded output or artifact fallback, cancellation behavior, and explicit failure/unknown-result semantics.

#### Scenario: Patch succeeds inside the bound workspace

- **WHEN** the Agent submits a valid patch against the expected content in the authorized workspace and the user policy permits it
- **THEN** the exact bound CLI applies it once and returns a durable result containing the changed paths without exposing unrelated files

#### Scenario: Patch target changed before execution

- **WHEN** the target content no longer matches the patch precondition
- **THEN** the CLI returns an explicit conflict without overwriting the newer content and the Agent can reason about that tool failure

#### Scenario: Tool side effect has an unknown result

- **WHEN** connection is lost after a non-idempotent coding tool may have changed the workspace but before its result is committed
- **THEN** the ToolExecution becomes `ResultUnknown` and the Runtime does not silently execute it again

#### Scenario: Capability has no implementation mapping

- **WHEN** baseline comparison finds a wired Kodex coding tool with no Node implementation
- **THEN** CAP-014 remains unverified and complete parity cannot be claimed

### Requirement: CAP-015 Durable HITL

Human-input and approval requests SHALL be durable, typed, bound to one Run and interrupt identity, and resumable after Runtime or CLI restart.

#### Scenario: Same answer is submitted twice

- **WHEN** a client retries an already accepted interrupt answer with the same idempotency key
- **THEN** the Runtime returns the existing outcome and does not resume the graph twice

### Requirement: CAP-015 HITL rejection

The user SHALL be able to reject an interrupt without the Runtime fabricating a successful tool result, and the resulting Run behavior SHALL be explicit.

#### Scenario: User rejects dangerous operation

- **WHEN** the user rejects a pending local command approval
- **THEN** the durable interrupt records rejection and the Agent receives the defined rejection outcome

### Requirement: CAP-016 Subagent isolation

Deep Agents SubAgents SHALL run as distinct child Runs with observable lineage, isolated context, bounded budgets and automatic result return to the parent while inheriting or narrowing the parent owner, workspace, tool permissions and memory scopes. Parent cancellation SHALL propagate to unfinished child Runs.

#### Scenario: Subagent requests broader workspace access

- **WHEN** a subagent attempts a local tool outside its inherited workspace capability
- **THEN** the request is rejected and the parent capability is not expanded

#### Scenario: Child Run completes

- **WHEN** a SubAgent child Run reaches a terminal success state
- **THEN** its bounded result is durably returned to the parent Run and remains inspectable in the CLI lineage view without creating a top-level Session

The fixed-baseline suggested-independent-Session workflow is an explicitly approved product exclusion. It SHALL NOT be implemented or counted as SubAgent coverage.

#### Scenario: Suggested Session workflow is absent from the approved target

- **WHEN** the fixed-baseline capability inventory and packaged CLI collaboration surfaces are evaluated for this release
- **THEN** Suggested Sessions are recorded as an approved functional divergence, no suggested-Session command or UI is exposed, and their absence does not count as SubAgent coverage
