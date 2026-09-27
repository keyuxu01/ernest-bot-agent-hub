# ADR-0010: Use TanStack Query for Browser Server State

- Status: Accepted
- Date: 2026-09-28

## Context

The Next.js client needs consistent browser-side loading, error, caching, invalidation, mutation and
pagination behavior for ordinary business APIs. The oRPC proof of concept already provides a contract-first
client and runtime response validation, but direct calls alone do not provide a shared browser server-state
lifecycle.

AI SDK/AG-UI streams and MCP interactions have different transport semantics and must not be forced into an
ordinary request/response query cache.

## Decision

- Use stable TanStack Query v5 as the browser server-state layer.
- Generate query and mutation options plus keys with stable `@orpc/tanstack-query` v1 utilities instead of
  hand-written string keys.
- Create one QueryClient per mounted application Provider, with explicit default stale time and retry policy.
- Keep the root Next.js layout as a Server Component and add the Provider as a narrow Client Component
  boundary.
- Put query state orchestration in hooks and keep components presentation-only.
- Keep direct oRPC calls available for Server Components and non-cached imperative work.
- Adopt SSR prefetch/dehydrate/hydrate only on routes that need it; do not add global hydration machinery
  before a route has prefetched state.
- Keep AI streaming and MCP outside TanStack Query.

## Query Identity and Validation

Query identity comes from the oRPC operation path and validated input through generated `.queryKey()` and
`.key()` helpers. The existing OpenAPILink and response-validation plugin remain the only transport and
boundary-validation path; query hooks do not construct another client.

Malformed service output becomes a query error and is never exposed as valid data. At-least-once backend
jobs, RabbitMQ and Redis concerns remain independent of browser cache identity.

## Consequences

- Components receive predictable pending, error and success states.
- Fresh requests with the same generated identity reuse cached data.
- Mutations can invalidate related reads without duplicating string keys.
- The root Provider adds a small client boundary and browser JavaScript to every route; it can move to a
  narrower layout if future routes do not consume interactive server state.
- Content-sensitive routes may later need server prefetch and hydration to avoid client-only loading states.

## Alternatives

- Direct oRPC calls in every component: minimal dependencies, but duplicates loading, error and cache logic.
- Hand-written TanStack Query keys and query functions: functional, but discards contract-derived operation
  identity and risks key drift.
- Wrap AI streams in TanStack Query: rejected because incremental stream state is not ordinary cached server
  state.
