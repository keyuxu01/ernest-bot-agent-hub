## Purpose

Define who may use the networked Assistant, which Assistant resources each identity may access, and how credentials, retained data and deletion remain safe across Runtime and CLI boundaries.

## ADDED Requirements

### Requirement: CAP-001 Assistant admission

The system SHALL authenticate CLI users through Google OAuth Authorization Code with PKCE, SHALL admit only enabled identities present in the Assistant-specific user registry, and SHALL reject missing, disabled or unknown identities with an unauthenticated response.

#### Scenario: Google identity is not allowlisted

- **WHEN** Google authentication succeeds but the stable subject is not an enabled Assistant user
- **THEN** UserPlatform returns 401 and issues no Assistant access token

#### Scenario: Allowlisted identity signs in

- **WHEN** an enabled Assistant user completes the loopback OAuth flow with a valid PKCE verifier
- **THEN** UserPlatform issues a short-lived Assistant token bound to that user

### Requirement: CAP-001 Service token boundary

The CLI SHALL communicate directly with repository services over HTTP/HTTP+SSE localhost in development and test, and over HTTPS/HTTPS+SSE in production or for every non-loopback endpoint. UserPlatform SHALL issue a short-lived asymmetrically signed token, and Runtime SHALL validate its configured algorithm, signature, issuer, audience, subject and expiry locally without a per-request UserPlatform call. This change SHALL NOT require Nest TCP communication between the two services.

#### Scenario: Developer runs all Assistant applications from the monorepo

- **WHEN** the CLI runs in development or test with `USER_PLATFORM_URL=http://localhost:9040` and `ASSISTANT_RUNTIME_URL=http://localhost:9030`
- **THEN** it connects directly without requiring local domains, certificates, tunnels, or a reverse proxy

#### Scenario: Runtime receives a valid Assistant token

- **WHEN** a token has a valid signature and the expected issuer, Runtime audience, subject and unexpired lifetime
- **THEN** Runtime authenticates the caller without synchronously calling UserPlatform

#### Scenario: Runtime receives a token for another service

- **WHEN** a correctly signed token has an audience other than AssistantRuntime
- **THEN** Runtime rejects it without accessing an Assistant resource

#### Scenario: Production CLI attempts a cleartext service connection

- **WHEN** a production CLI is configured with an HTTP or downgraded UserPlatform or AssistantRuntime endpoint, or a development CLI targets a non-loopback HTTP endpoint
- **THEN** the CLI rejects the connection before sending an OAuth code, Assistant token, command, or stream request

### Requirement: CAP-001 Token revocation

The system SHALL use a five-minute access-token expiry as the phase-1 revocation bound. Disabling an Assistant user SHALL prevent new token issuance or refresh; an already issued token SHALL become unusable, and an authenticated stream SHALL close, no later than that token's expiry.

#### Scenario: User is disabled after login

- **WHEN** a previously admitted user is disabled
- **THEN** UserPlatform issues no new token, and the existing token plus any stream becomes unusable no later than the configured access-token expiry

### Requirement: CAP-031 Minimum public-exposure gate

The system SHALL NOT expose Assistant command or stream endpoints for production use until authentication, per-resource ownership checks, finite request and stream limits, and per-user concurrency and model-cost budgets are active. User-configured MCP SHALL accept only public-network HTTPS endpoints and SHALL reject other schemes, loopback, link-local, private-network and metadata-service destinations after DNS resolution for the initial request and every redirect or actual connection attempt. No stdio MCP mode is supported.

#### Scenario: Production starts without an authentication guard

- **WHEN** a production deployment would expose an Assistant command or stream endpoint without its authentication guard
- **THEN** readiness fails and the endpoint is not admitted for production traffic

#### Scenario: A required public-exposure control is absent

- **WHEN** any one of authentication, per-resource ownership, finite request/stream limits, per-user concurrency budget or model-cost budget is inactive
- **THEN** production readiness is false and command/stream endpoints are not admitted for production traffic

#### Scenario: Every required public-exposure control is active

- **WHEN** authentication, per-resource ownership, finite request/stream limits, per-user concurrency budget and model-cost budget are all active
- **THEN** this minimum public-exposure gate permits production readiness to be evaluated against the remaining dependency checks

#### Scenario: User configures a private-network MCP target

- **WHEN** an unprivileged user supplies an MCP hostname that resolves to a blocked local or private address
- **THEN** the connection is rejected before Runtime sends credentials or an HTTP request

#### Scenario: A remote MCP redirect resolves to a blocked address

- **WHEN** an allowed remote MCP hostname redirects or is rebound to a loopback, link-local or private-network address
- **THEN** Runtime rejects that connection attempt before sending credentials or an HTTP request to the blocked address

### Requirement: CAP-002 Per-resource ownership

The Runtime SHALL authorize every Session, Run, Event, Artifact, Settings, MCP configuration, provider credential, Mem0 scope, CLI binding and fork operation against the authenticated Assistant user.

#### Scenario: User requests another user's Session

- **WHEN** an authenticated user addresses a Session owned by another user
- **THEN** the Runtime reveals no Session data and performs no mutation

### Requirement: CAP-002 CLI and workspace binding

The Runtime SHALL bind local tool execution to one authenticated CLI instance and one declared workspace capability, and SHALL reject results from a different instance or workspace.

#### Scenario: Result arrives from a different CLI instance

- **WHEN** a local tool result is submitted by a CLI instance not bound to that ToolExecution
- **THEN** the Runtime rejects the result and leaves the pending execution unchanged

### Requirement: CAP-031 Secret protection

The system SHALL encrypt provider and MCP credentials at rest, SHALL keep plaintext credentials out of events, SSE, traces and ordinary logs, and SHALL apply documented redaction and size limits to prompts and tool data.

#### Scenario: Tool arguments contain a configured secret

- **WHEN** the Runtime records or exports diagnostics for the tool call
- **THEN** the configured secret is redacted and the durable event contains only an allowed reference or redacted value

### Requirement: CAP-002 User-owned model connection

The CLI SHALL accept a masked user API key, public HTTPS base URL and free-form model name, and MAY accept reasoning effort and service tier. Runtime SHALL validate the exact connection, encrypt the API key in PostgreSQL, return only a connection reference, and SHALL NOT persist plaintext credentials in Redis, Session state, events, streams, logs or local CLI configuration. Runtime SHALL reject non-HTTPS, loopback, link-local, private-network and metadata-service destinations after DNS resolution for the initial request, every redirect and every actual model connection attempt, before transmitting the API key.

#### Scenario: User saves a custom model connection

- **WHEN** the owner supplies a public HTTPS base URL, API key and model that pass the exact-model connection test
- **THEN** Runtime persists an encrypted owner-scoped credential, returns a redacted connection reference, and exposes no plaintext key

#### Scenario: Model base URL resolves to a private destination

- **WHEN** the supplied model base URL resolves or redirects to a blocked local, private, link-local or metadata-service address
- **THEN** Runtime rejects it before transmitting the API key

#### Scenario: Model destination changes before the actual connection

- **WHEN** a previously public model hostname is rebound or redirected to a loopback, link-local, private-network or metadata-service address before an actual connection attempt
- **THEN** Runtime revalidates and rejects that attempt without transmitting the API key or model request

### Requirement: CAP-031 Deletion and retention

Archive SHALL remain reversible, while confirmed Session deletion SHALL be irreversible. Deletion SHALL remove the target's events, checkpoints, tool records, Redis projections, Session-scoped Mem0 and artifact references without changing an independently forked Session, user-scoped Mem0 or blobs that still have another reference. The system SHALL report partial deletion failures rather than claiming complete deletion.

#### Scenario: Mem0 deletion fails after Session data deletion

- **WHEN** a user deletes a Session and durable Session data is removed but scoped Mem0 deletion fails
- **THEN** the operation reports a partial failure with a retryable cleanup record
