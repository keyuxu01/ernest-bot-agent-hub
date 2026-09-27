## Purpose

Provide predictable, type-safe client-side server-state behavior for interactive Next.js interfaces while
preserving the runtime validation and application boundaries of the shared business API contract.

## ADDED Requirements

### Requirement: Typed query consumption

The web client SHALL expose business API reads as query options whose input and output types are derived
from the shared runtime contract, without importing NestJS application source.

#### Scenario: Component consumes a successful query

- **WHEN** a client component requests the greeting through the query integration
- **THEN** it receives a greeting with a string message that has passed the shared runtime response
  validation

#### Scenario: Business response violates the contract

- **WHEN** the business service returns a greeting payload that violates the shared response schema
- **THEN** the query enters an error state instead of exposing the invalid payload as data

### Requirement: Observable query lifecycle

The web client SHALL provide loading, error and success states for interactive business API reads, and an
API failure SHALL NOT prevent the surrounding page from rendering.

#### Scenario: Query is pending

- **WHEN** a client-side greeting request has not completed
- **THEN** the greeting UI renders a loading state

#### Scenario: Business service is unavailable

- **WHEN** the greeting request fails because the business service is unavailable
- **THEN** the greeting UI renders a recoverable error state while the rest of the page remains usable

### Requirement: Stable query identity and caching

The web client SHALL derive query identity from the typed business operation and its input, and SHALL reuse
fresh cached data for repeated requests with the same identity.

#### Scenario: Same operation and input are requested repeatedly

- **WHEN** the same greeting query is requested again before its configured stale period expires
- **THEN** the cached result is returned without issuing another network request

#### Scenario: Operation data is invalidated

- **WHEN** a caller invalidates queries using the typed operation key
- **THEN** matching cached queries become eligible for refetch without relying on a hand-written string key

### Requirement: Protocol boundary preservation

The system SHALL limit ordinary query caching to business API server state and SHALL preserve the existing
native transports for AI streaming and Agent-facing MCP interactions.

#### Scenario: AI response streams tokens

- **WHEN** an AI interaction produces incremental output
- **THEN** it continues to use the AI streaming transport rather than being wrapped as an ordinary cached
  business query

#### Scenario: Agent invokes a tool or resource

- **WHEN** an Agent communicates with the MCP service
- **THEN** it continues to use MCP independently of the web client's query cache
