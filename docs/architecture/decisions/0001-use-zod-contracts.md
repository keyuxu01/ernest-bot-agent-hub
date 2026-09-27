# ADR-0001: Use Zod-Based Shared Runtime Contracts

- Status: Accepted
- Date: 2026-09-27

## Context

The Next.js client, NestJS services and MCP server exchange the same payloads. TypeScript-only interfaces
cannot validate external JSON at runtime and allow producers and consumers to drift.

## Decision

Use `packages/contracts` (`@repo/contracts`) as the single source of truth for cross-application payloads.
Define each public boundary model with a Zod Schema and derive its TypeScript input or output types from
that Schema. Compile the package to `dist` so browser bundlers and Node.js consume the same runtime boundary.

Validate untrusted values at HTTP, RPC, MCP and form boundaries. Local component props and internal-only
types do not require runtime schemas.

## Consequences

- Runtime and compile-time contracts share one definition.
- Frontend, backend and MCP can reuse schemas without importing application code.
- Contract changes require tests and verification of all affected consumers.
- The shared package contains runtime code and must be built before application consumers.

## Alternatives

- TypeScript-only shared interfaces: rejected because they provide no runtime validation.
- Separate DTOs and frontend types: rejected because duplicate definitions drift.
- Generate contracts exclusively from OpenAPI: deferred because the first phase already uses Zod directly.
