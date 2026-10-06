# ADR-0018: Separate UserPlatform, AssistantRuntime, and the Local CLI

- Status: Accepted
- Date: 2026-10-05
- Related: [Node Assistant Runtime proposal](../proposals/2026-10-05-node-agent-runtime-plan.md), [OpenSpec change](../../../openspec/changes/implement-node-assistant-runtime/proposal.md)

## Context

The Assistant will be a network service that can coordinate models, remote MCP tools, and privileged tools in a user's local workspace. The current Assistant apps are transport scaffolds only. Folding login, execution, and local capability into one process would mix trust boundaries and make a disconnected client own backend work.

## Decision

- `apps/user-platform-service` owns Google OAuth Authorization Code + PKCE, the Assistant-only user allowlist, short-lived access grants, revocation, and identity administration. It is not the RAG RBAC system.
- The CLI reaches UserPlatform and AssistantRuntime through their network APIs. Local development and test use loopback HTTP (`localhost:9040` and `localhost:9030`) without a certificate proxy; production and every non-loopback target require HTTPS/HTTPS+SSE. The CLI receives a five-minute asymmetrically signed Assistant access token, and Runtime validates its signature and claims locally from a configured public-key set; it does not call UserPlatform on every request. Disabling a user immediately blocks new issuance and refresh. Existing tokens and streams end no later than token expiry; phase 1 adds no revocation bus, deny list, or per-request introspection.
- `apps/assistant-runtime-service` validates UserPlatform grants and owns Assistant Sessions, Runs, events, models, tools, memory orchestration, and recovery. HTTP and SSE connections do not own Run lifetime. UserPlatform and AssistantRuntime do not use Nest TCP transport.
- `apps/assistant-cli` is the Ink product client and local capability host. It does not connect directly to models, PostgreSQL, Redis, or Mem0.
- `packages/contracts` publishes versioned `UserPlatform*` and `AssistantRuntime*` Zod schemas. Shared contracts contain no service or domain implementation.
- The Assistant remains a product boundary parallel to `RagBusiness` and `mcp-app-collections`.

## Consequences

- Identity and privileged execution can deploy, rotate keys, and scale independently.
- Every Runtime resource still requires owner authorization after authentication.
- Client disconnect, CLI exit, and SSE unsubscribe do not imply Run cancellation.
- The repository gains a third NestJS application and a first-class Ink application, both following existing workspace build conventions.
- Developers can run the repository-owned services directly on localhost; local TLS and a development domain are not prerequisites.

## Alternatives

- One NestJS service for login and execution: rejected because it couples a thin allowlist to a privileged runtime.
- Add Assistant execution to the RAG business service: rejected because its lifecycle, data, and trust model are independent.
- Nest TCP between UserPlatform and Runtime: rejected because the phase-1 hot path needs no synchronous service call, while OAuth callbacks and CLI APIs already require HTTPS.
- Keep a single-process local agent: rejected because it does not meet the selected network/multi-device product architecture.
