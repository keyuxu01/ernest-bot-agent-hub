## Why

The web client currently hand-writes `fetch` calls and repeats response validation even though the repository already owns shared Zod schemas. A small oRPC integration will test contract-first, end-to-end type safety and OpenAPI interoperability on the existing greeting flow before the knowledge-base API surface grows.

## What Changes

- Add an oRPC contract for retrieving the business-service greeting, using the existing shared Zod response schema and an isolated `@repo/contracts/orpc` export surface.
- Implement the contract through the official NestJS integration while preserving the existing `GET /` endpoint as a fallback during the evaluation.
- Replace the Next.js greeting transport with an oRPC OpenAPI client that imports no NestJS source.
- Expose and verify an OpenAPI document for the implemented contract.
- Add contract, server, client and end-to-end tests covering valid responses and transport or validation failures.
- Use the current stable oRPC v1 release line and exclude prerelease tags; keep ADR-0004 in Proposed status until the broader knowledge-base query, mutation, authentication and typed-error criteria are evaluated.

## Capabilities

### New Capabilities

- `typed-business-api`: Contract-first access from the Next.js client to NestJS business APIs, with runtime validation and OpenAPI description.

### Modified Capabilities

None.

## Impact

- `packages/contracts`: gains a separate oRPC contract export that reuses base Zod schemas without making ordinary schema consumers load oRPC.
- `apps/agentic-rag-business-service`: gains the oRPC NestJS module, a contract implementation, OpenAPI output and integration tests.
- `apps/agentic-rag-client`: gains an oRPC client wrapper and updates greeting tests while preserving the current UI behavior.
- Workspace dependencies and `pnpm-lock.yaml`: gain exact, compatible stable oRPC v1 packages.
- `docs/architecture`: records the PoC outcome without yet accepting oRPC as the repository-wide protocol.
