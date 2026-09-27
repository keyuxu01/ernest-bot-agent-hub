# ADR-0004: Evaluate oRPC for Web-to-Service APIs

- Status: Proposed
- Date: 2026-09-27

## Context

The Next.js client and NestJS business service need type-safe APIs without making the frontend import NestJS
router implementation types. Future consumers may also require standard OpenAPI documentation.

## Proposed Decision

Run a limited oRPC contract-first proof of concept before adopting it broadly. Keep Zod schemas in
`@repo/contracts`, add RPC contracts as a separate explicit export surface, implement them in NestJS and
consume them from Next.js without importing backend source.

The PoC uses only versions published under npm's `latest` tag. Prerelease lines such as `beta` and `next`
are excluded unless a later ADR explicitly approves them.

## Implemented PoC Slice

The first integration slice uses stable oRPC v1 packages (`1.15.4`, with `@orpc/nest` at `1.15.3`):

- `@repo/contracts/orpc` exposes the contract while the root package entry remains limited to base Zod
  schemas and inferred types.
- NestJS implements `GET /api/greeting` through `@orpc/nest` and delegates to the existing application
  service.
- Next.js calls the operation through `OpenAPILink` with client-side response validation.
- Browser-rendered reads use the stable `@orpc/tanstack-query` v1 integration to derive query options and
  cache keys from the same typed client; direct calls remain available for Server Components.
- `GET /openapi.json` exposes the generated OpenAPI document.
- The legacy `GET /` endpoint remains available during evaluation.

This slice validates the framework wiring only. The ADR remains Proposed until a representative
knowledge-base query and mutation, authentication context, typed business errors and operational
observability have also been evaluated.

The greeting integration now additionally demonstrates runtime-invalid response rejection, recoverable
network failure, stable operation-derived query identity, typed invalidation and fresh-cache reuse. This is
supporting evidence, but it does not satisfy the remaining knowledge-base mutation and authentication
criteria.

The PoC should cover a representative knowledge-base query and mutation, authentication context, typed
business errors, output validation, Next.js server/client consumption and OpenAPI generation. Existing HTTP
controllers remain in place until the PoC is accepted.

## Acceptance Criteria

- The frontend imports only shared contracts and client packages, never NestJS application source.
- NestJS dependency injection, guards, interceptors and exception mapping remain natural to use.
- Input, output and business errors remain type-safe and runtime validated.
- OpenAPI output accurately represents the implemented endpoints.
- MCP consumers can import base schemas without loading the RPC client or server runtime.
- Production builds, tests and operational debugging are no worse than the current fetch-and-Zod baseline.

## Consequences if Accepted

- Web API calls gain contract-first clients and first-class OpenAPI generation.
- The repository adds oRPC runtime dependencies and conventions that must be maintained.
- AI UI streaming and MCP continue using their native protocol boundaries.

## Alternatives

- Continue with fetch and Zod: simplest baseline and the fallback if the PoC adds insufficient value.
- tRPC: mature and productive, but its common server-router type model is more tightly coupled to backend code.
- OpenAPI-first code generation: interoperable, but introduces a generation workflow before the need is proven.
