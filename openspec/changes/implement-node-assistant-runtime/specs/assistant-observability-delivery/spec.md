## Purpose

Define evidence required to diagnose, migrate, verify and release the Assistant so implementation presence is never confused with complete capability delivery.

## ADDED Requirements

### Requirement: CAP-029 Correlated observability

The system SHALL correlate logs, traces and metrics by user-safe Session, Run, Turn, ToolExecution and request identifiers while redacting protected content and credentials.

#### Scenario: Tool execution fails across services

- **WHEN** a remote MCP ToolExecution fails
- **THEN** authorized operators can correlate the Runtime request, MCP call and final event without exposing plaintext secrets

### Requirement: CAP-029 Durable audit

Security-sensitive commands, ownership failures, tool execution, settings changes, fork, deletion and administrative admission changes SHALL produce an auditable outcome.

#### Scenario: Stale replica attempts commit

- **WHEN** a replica with an expired fencing token attempts to commit Run progress
- **THEN** the rejection is observable with the stale and current ownership identifiers

### Requirement: CAP-032 Capability ledger gates

Every CAP entry SHALL progress only through Proposed, Specified, Implemented, Verified or Blocked using recorded specification, implementation and verification evidence; only Verified counts as delivered.

#### Scenario: Code compiles without behavior test

- **WHEN** implementation files exist and compile but required scenarios or runtime acceptance have not run
- **THEN** the capability remains Specified and is not reported as Implemented or Verified

### Requirement: CAP-032 Independent coding-session audit

Each coding session SHALL begin by selecting CAP IDs and required evidence and SHALL end with an independent capability-auditor review of diffs, tests, runtime evidence, residual risk and ledger status.

#### Scenario: Implementing agent claims completion

- **WHEN** the coding agent reports a CAP complete without an independent evidence review
- **THEN** the ledger does not advance that CAP to Verified

### Requirement: CAP-032 Migration and rollback evidence

Every durable schema or protocol change SHALL include forward migration, compatibility boundary, rollback or roll-forward plan, and representative migration verification before release.

#### Scenario: Database migration lacks recovery evidence

- **WHEN** a migration changes durable Assistant state without a tested recovery path
- **THEN** release verification fails and affected capabilities remain below Verified

### Requirement: CAP-032 Approved-target acceptance

The product SHALL NOT claim the approved Node target scope complete until every required CAP is Verified and all exclusions, untested platforms and known risks are disclosed. Because Suggested Sessions are an approved exclusion from a wired fixed-baseline capability, this release SHALL NOT claim exact or complete Kodex baseline parity even when all CAP entries are Verified.

#### Scenario: One required target capability is blocked

- **WHEN** any required baseline CAP remains Blocked, Proposed, Specified or Implemented
- **THEN** release notes cannot state that the approved Node target scope is complete and cannot state exact Kodex baseline parity
