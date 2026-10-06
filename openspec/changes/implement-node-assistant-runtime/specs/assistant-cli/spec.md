## Purpose

Define the complete Ink terminal product that projects Runtime state, preserves renderer-local interaction state and exposes every required Session, history, tool and configuration workflow.

## ADDED Requirements

### Requirement: CAP-026 Session navigation

The CLI SHALL render Session creation, ordered navigation, running status, rename, archive, irreversible delete, fork, `Revert to here` and `Revert and edit` while keeping local selection and drafts separate from backend truth.

#### Scenario: Selected Session is archived remotely

- **WHEN** the selected Session becomes archived through an accepted command
- **THEN** the CLI updates its projection predictably without inventing a second Session state

### Requirement: CAP-026 Bounded history UI

The CLI SHALL page large histories, preserve stable item identity, merge live and durable events without duplicates, and render message, reasoning, tool, plan, compact, HITL and subagent work distinctly.

#### Scenario: Live item becomes durable

- **WHEN** a streamed assistant item is committed and replayed as a durable event
- **THEN** the CLI replaces or reconciles the live item without rendering duplicate content

### Requirement: CAP-027 Composer controls

The CLI SHALL submit a new Turn when no Run is active, SHALL steer when the selected Session has an active Run, and SHALL expose explicit stop separately from stream unsubscribe.

#### Scenario: Running status changes before UI projection updates

- **WHEN** the authoritative Runtime already has an active Run but the local projection is stale
- **THEN** command acceptance follows backend state and does not start a conflicting second Run

### Requirement: CAP-027 Workspace and settings UI

The CLI SHALL provide workspace path selection, user-owned model connection entry, Session model/runtime settings and version-conflict feedback without directly reading or writing Runtime persistence stores. Provider entry SHALL mask the API key, require a public HTTPS base URL and free-form model, and expose reasoning effort and service tier only as optional fields.

#### Scenario: Settings edit conflicts

- **WHEN** a settings CAS fails because the edited field changed remotely
- **THEN** the CLI preserves the user's draft and displays a conflict instead of silently overwriting the new value

### Requirement: CAP-027 Complete sidebars and local preferences

The CLI SHALL preserve the fixed Kodex history and terminal sidebars, their actions and shortcuts, visibility and width restoration, focus, scrolling, input newline/submit preferences and restart behavior. These pure presentation preferences SHALL be stored locally and SHALL NOT contain provider keys, access tokens or Runtime truth.

#### Scenario: CLI restarts after layout changes

- **WHEN** the user changes sidebar visibility, widths and input behavior and later restarts the CLI
- **THEN** the complete layout/input preferences are restored while Session and Run state are projected from Runtime

### Requirement: CAP-027 Tool and artifact UI

The CLI SHALL render patches, images, artifacts, pending approvals, command output and interactive process input using the exact Session, Run and ToolExecution identities.

#### Scenario: User sends stdin to an old process

- **WHEN** the selected history item no longer refers to the active process session
- **THEN** the CLI refuses the stale action and sends no stdin to another process

### Requirement: CAP-027 Terminal interaction quality

The Ink UI SHALL support keyboard navigation, pointer interaction where available, focus, modal containment, terminal resize and narrow layouts without forking business actions by input method.

#### Scenario: Terminal becomes narrow

- **WHEN** terminal width shrinks below the preferred multi-pane layout
- **THEN** essential history, composer and active modal interactions remain reachable without losing backend state
