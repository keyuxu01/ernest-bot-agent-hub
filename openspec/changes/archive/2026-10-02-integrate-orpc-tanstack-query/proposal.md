## Why

The Next.js client already has a runtime-validated oRPC client, but it lacks a standard client-side
server-state layer for caching, loading and error states, mutations, pagination and invalidation. Adding
the stable oRPC TanStack Query integration now establishes the frontend data-access pattern needed by the
knowledge-base UI before its query and mutation surface grows.

## What Changes

- Add stable, pinned TanStack Query and oRPC TanStack Query dependencies to the Next.js client.
- Create a single browser `QueryClient` lifecycle and provide it at the application root.
- Wrap the existing typed oRPC client with `createTanstackQueryUtils` and expose contract-derived query
  options and keys.
- Use the greeting operation as the first client-side query example, including loading, error and success
  rendering while preserving runtime response validation.
- Test successful queries, cache reuse and failures through the typed query integration.
- Document when to use direct oRPC calls, TanStack Query, hydration, AI streaming and MCP, and update the
  architecture decision record and project guide.

## Capabilities

### New Capabilities

- `frontend-server-state`: Typed client-side server-state management backed by the shared oRPC contract and
  TanStack Query.

### Modified Capabilities

None.

## Impact

- Affected frontend code: `apps/agentic-rag-client/app`, `components`, `hooks` and `lib`.
- New frontend dependencies: `@orpc/tanstack-query@1.15.4` and a pinned stable
  `@tanstack/react-query` v5 release.
- Existing NestJS routes, shared Zod schemas, oRPC wire protocol, OpenAPI output, AI streaming and MCP
  boundaries remain unchanged.
- Documentation impact: root README, oRPC guide, architecture overview, ADR-0004 and a dedicated TanStack
  Query ADR.
