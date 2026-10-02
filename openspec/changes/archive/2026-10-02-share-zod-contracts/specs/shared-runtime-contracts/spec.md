## Purpose

Provide one runtime-validatable contract source for data exchanged between frontend, backend, MCP tools, and MCP widgets while deriving matching TypeScript types automatically.

## ADDED Requirements

### Requirement: Cross-application payloads have a canonical runtime contract

The system SHALL define each payload exchanged across application or process boundaries with one shared runtime schema.

#### Scenario: Consumer uses a shared response contract

- **WHEN** a frontend, backend, MCP tool, or MCP widget consumes a shared response payload
- **THEN** it can import the same runtime contract used by the payload producer

### Requirement: Static types are inferred from runtime contracts

The system MUST derive the TypeScript input and output types for a shared payload from its canonical runtime schema rather than declaring a structurally duplicated interface or type alias.

#### Scenario: Contract fields change

- **WHEN** a field is added, removed, or transformed in a shared runtime schema
- **THEN** TypeScript consumers observe the corresponding inferred type change without updating a second declaration

### Requirement: Untrusted boundary data is validated

The system SHALL validate untrusted API and MCP payloads before application code relies on their fields.

#### Scenario: Valid payload crosses a boundary

- **WHEN** a payload satisfies its shared runtime contract
- **THEN** validation returns typed data for the consumer

#### Scenario: Invalid payload crosses a boundary

- **WHEN** a payload does not satisfy its shared runtime contract
- **THEN** validation fails explicitly and the consumer does not treat the payload as valid typed data

### Requirement: Contract package is usable by every application boundary

The shared contract package SHALL expose runtime schemas and their inferred types to the Next.js client, NestJS business service, MCP service, and MCP widget build without depending on a specific application runtime.

#### Scenario: Workspace checks run from a clean checkout

- **WHEN** workspace dependencies are installed and lint, type-check, test, and build tasks run
- **THEN** every consuming application resolves the same contract package successfully

### Requirement: Frontend-local types remain lightweight

The system SHALL permit compile-time-only TypeScript types for component props, hook contracts, and transient UI state that do not cross an untrusted application boundary.

#### Scenario: Component declares local presentation props

- **WHEN** a component prop type is used only within the frontend and does not represent external data
- **THEN** the type can remain a TypeScript-only declaration without a runtime schema
