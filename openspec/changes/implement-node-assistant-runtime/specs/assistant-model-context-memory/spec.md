## Purpose

Define model capability selection, local context snapshots, layered durable and short-term state, extracted long-term memory, hooks and usage reporting without conflating these independent concerns.

## ADDED Requirements

### Requirement: CAP-010 Model capability catalog

The Runtime SHALL expose the capabilities and limits of selectable models and SHALL prevent or explicitly disclose any loss of required streaming, tool, reasoning, image, structured-output or usage behavior.

A Session SHALL select an owner-scoped provider connection and a free-form model name. Reasoning effort and service tier SHALL be optional model-client parameters, omitted when unset, snapshotted on each Run and never misrepresented as Deep Agents configuration. Unsupported parameters SHALL fail visibly rather than being silently discarded.

#### Scenario: Selected model lacks required tool calling

- **WHEN** a Session requires coding tools and the selected model does not support compatible tool calling
- **THEN** the Runtime rejects the selection or presents an explicit approved fallback before starting a Run

### Requirement: CAP-021 Workspace context snapshot

The CLI SHALL resolve applicable AGENTS instructions and explicit Skills only inside the authorized workspace, and the Runtime SHALL bind each accepted snapshot to its content hash, relative source and Turn.

#### Scenario: Explicit Skill changes after Run acceptance

- **WHEN** an explicit Skill file changes after its Turn input was accepted
- **THEN** recovery and fork use the accepted Turn snapshot rather than silently substituting future content

#### Scenario: Context path escapes workspace

- **WHEN** a context source resolves outside the authorized workspace through traversal or a symbolic link
- **THEN** the CLI rejects it and sends no file content

### Requirement: CAP-022 Durable and hot state separation

PostgreSQL SHALL remain the source of truth for confirmed conversation and execution state, while Redis data SHALL be TTL-bound or otherwise reconstructable from durable state.

#### Scenario: Redis working set is missing

- **WHEN** a request opens an existing Session with no Redis keys
- **THEN** the Runtime reconstructs the current window and summary from durable events without losing confirmed history

### Requirement: CAP-023 Scoped Mem0 recall

The Runtime SHALL retrieve user-scoped and Session-scoped Mem0 facts separately, SHALL inject selected facts only as temporary model context, and SHALL NOT persist recalled facts as user or assistant messages.

#### Scenario: Recalled preference is used

- **WHEN** a relevant user preference is returned by Mem0
- **THEN** it influences the current request context but is not appended to Redis or PostgreSQL as a new conversation message

### Requirement: CAP-023 Managed Mem0 boundary

For this change, the Runtime SHALL use Mem0 Platform through an internal memory port and SHALL authenticate with a managed Platform credential. The product SHALL NOT require a vendored Mem0 OSS checkout, a Mem0 Git submodule, or an independently operated Mem0 service. Self-hosting SHALL remain outside this change and SHALL require a later specification and acceptance cycle before it is presented as supported.

#### Scenario: Phase 1 starts with managed memory

- **WHEN** the Runtime starts with valid Mem0 Platform configuration
- **THEN** it can construct the Platform adapter without a local Mem0 process, Mem0 source checkout, or self-hosted database

#### Scenario: Self-hosted configuration is requested

- **WHEN** an operator attempts to select a self-hosted Mem0 endpoint in this release
- **THEN** startup rejects the unsupported mode with an actionable error rather than silently claiming self-hosted support

### Requirement: CAP-023 Memory extraction lifecycle

After a completed Turn, the system SHALL classify information gain, SHALL avoid writing greetings and unchanged repetitions, and SHALL preserve memory source, scope, correction and deletion behavior. Eligible memory is limited to reusable preferences, stable project conventions, explicitly requested memories and filtered long-term facts. Credentials, authentication material, raw conversation transcripts, complete source files, patches, shell output and unprocessed tool results SHALL NOT be written to Mem0. The CLI SHALL let an owner inspect, correct and delete their memories.

#### Scenario: Turn repeats an existing fact

- **WHEN** the Turn contains no new information beyond an existing memory
- **THEN** memory extraction creates no duplicate entry

#### Scenario: Mem0 is unavailable

- **WHEN** conversation persistence succeeds but Mem0 extraction fails
- **THEN** the Turn remains completed, the system records an incomplete memory-extraction status, and a later retry is idempotent

#### Scenario: Candidate memory contains a secret or raw code

- **WHEN** extraction identifies an API key, authentication material, complete source file, patch or unprocessed tool output
- **THEN** the candidate is rejected before Mem0 persistence and the protected content is not copied into memory diagnostics

#### Scenario: Session memory is forked

- **WHEN** a Session is forked at a stable event
- **THEN** user-scoped memory remains shared by the owner while eligible Session-scoped facts up to the fork point are copied into an independent target scope

### Requirement: CAP-024 Configured lifecycle Hooks

The fixed Kodex baseline injects `NoOpKodexHooks` in its current RPC production path, so configured Hook execution is classified as a Node enhancement rather than a claim about current Kodex wiring. This change nevertheless SHALL implement ordered owner-scoped Hooks for `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `PreCompact`, `PostCompact` and `UnhandledError`.

Hook configuration SHALL be versioned and snapshotted into a Run. Workspace commands SHALL execute only through the exact authorized Local Tool Gateway binding, receive a typed redacted context, obey a finite configured timeout and Run cancellation, and emit durable outcomes. Hooks SHALL run in configured order. `PreToolUse` and `UserPromptSubmit` may explicitly allow or block; `Stop` may request a bounded continuation associated with the controlling Hook; notification Hooks SHALL NOT rewrite durable history or expand authorization.

#### Scenario: PreToolUse blocks a local command

- **WHEN** ordered `PreToolUse` Hooks reach one that returns a valid block result
- **THEN** later Hooks and the tool do not execute, and the durable ToolExecution records the controlling Hook and model-visible rejection

#### Scenario: Hook times out

- **WHEN** a controlling Hook exceeds its finite timeout
- **THEN** the Runtime cancels that Hook execution and applies the configured fail-closed policy without treating it as a successful tool result

#### Scenario: Run is cancelled during a Hook

- **WHEN** a Run is stopped while a workspace Hook command is active
- **THEN** cancellation propagates through the Local Tool Gateway, later Hooks do not start, and the final known or unknown Hook outcome is durable

#### Scenario: UnhandledError notification Hook fails

- **WHEN** an `UnhandledError` notification Hook exits unsuccessfully
- **THEN** its failure is audited but does not replace, suppress, or mutate the original Run failure

#### Scenario: Hook configuration changes during a Run

- **WHEN** Hook settings are edited after a Run accepted its configuration snapshot
- **THEN** that Run continues with its accepted ordered snapshot and later Runs use the new version

### Requirement: CAP-028 Usage reporting

The Runtime SHALL normalize available provider token, limit and cost information while distinguishing provider-reported values, product estimates and unavailable data.

#### Scenario: Provider omits cost information

- **WHEN** a completed response includes token usage but no price or account limit
- **THEN** the UI displays the known usage and marks cost or limit as unavailable rather than fabricating a value

The Runtime SHALL aggregate provider-reported input, output, cached, reasoning and total tokens for Run, Session and owner views. Provider account balance and reset time SHALL be shown only when the selected provider exposes a supported adapter; an unsupported value SHALL be `Unavailable`, not zero. This change SHALL NOT implement charging, top-up or billing settlement.

#### Scenario: Provider exposes account balance and reset time

- **WHEN** the selected provider adapter returns supported account balance and reset-time metadata
- **THEN** the CLI labels those values as provider-reported and preserves their provider timestamp without estimating missing billing data

#### Scenario: User opens usage without provider billing support

- **WHEN** the selected provider exposes no balance or reset adapter
- **THEN** the CLI shows those fields as Unavailable and exposes no charge, top-up, invoice, payment or billing-settlement action
