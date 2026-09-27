## Context

See `proposal.md` for motivation and `specs/frontend-server-state/spec.md` for observable requirements.
The Next.js App Router client currently creates one stable oRPC v1 `OpenAPILink` and exposes a direct
`getGreeting` function. The home page is a Server Component that awaits this function and handles failures
locally. There is no browser query cache or application provider.

The project pins stable oRPC v1 packages, requires shared boundary schemas in `@repo/contracts`, and keeps
AI streaming, business HTTP APIs and MCP as separate protocols. Frontend files must preserve the existing
directory style and dependency direction defined in `.rulesync/rules/frontend.md`.

## Goals / Non-Goals

**Goals:**

- Add one reusable TanStack Query lifecycle for browser-rendered business data.
- Preserve the existing oRPC client as the only transport and validation implementation.
- Demonstrate typed query options, generated keys, cache reuse and recoverable UI states with the greeting
  operation.
- Keep direct oRPC calls available for Server Components and non-cached imperative work.
- Document an SSR hydration policy before knowledge-base pages require prefetching.

**Non-Goals:**

- Adding knowledge-base contracts, mutations, optimistic updates or persistent cache storage.
- Routing AI SDK/AG-UI streams or MCP calls through TanStack Query.
- Changing NestJS, shared schemas, OpenAPI endpoints or the oRPC v1 wire format.
- Implementing SSR prefetch/hydration for the greeting example, whose purpose is to verify the browser
  integration.

## Decisions

### Pin the stable v1 integration

Add `@orpc/tanstack-query@1.15.4` and pin a stable TanStack Query v5 version rather than using range or
prerelease tags. This matches the existing oRPC v1 package line and prevents a future v2 prerelease from
entering through an unbounded install.

Alternative considered: call `useQuery` with hand-written `queryFn` and string keys. Rejected because it
duplicates operation identity and loses the contract-derived option/key utilities that motivated the
integration.

### Wrap the existing client once

Export the existing typed `businessApiClient` from the API module and build one `businessApiQuery` utility
tree with `createTanstackQueryUtils`. The query layer does not create a second link and therefore preserves
the existing response-validation plugin, base URL and fetch behavior.

Alternative considered: construct oRPC links inside hooks. Rejected because it creates unstable transport
instances and mixes infrastructure into React state logic.

### Call the Cloudflare API origin directly from the browser

The production target deploys the Next.js application to Vercel at `ernestbot.com` and exposes the business
API through a Cloudflare Worker at `api.ernestbot.com`. These resources are not provisioned yet. Browser oRPC calls use a public client-safe API base URL
and do not pass through a Vercel rewrite. The Worker is the only public ingress and routes accepted requests
to the NestJS Container.

Because the two hostnames are different origins, the Worker owns a strict CORS allowlist. Production allows
only the configured Web origin, development additionally allows `http://localhost:3000`, and preflight
responses advertise only the methods and headers used by the API. Credentialed requests must echo the exact
origin and may never use a wildcard. The Container is not exposed as a second public origin.

Alternative considered: proxy all browser calls through the Vercel application. Rejected because it adds an
extra network hop and couples business API availability and bandwidth to the frontend deployment.

### Use one browser QueryClient per mounted application

Create a QueryClient factory with explicit defaults and instantiate it once in a small client Provider via
lazy React state. Mount that Provider in the root layout. This keeps the root layout and its children usable
as Server Components while client components share one browser cache.

The initial stale period will be a named constant rather than a magic number. Query retry behavior remains
TanStack Query's responsibility; the oRPC retry plugin will not be layered on top.

Alternative considered: a module-global browser QueryClient. Rejected because provider-owned lifecycle is
easier to test and avoids accidental server/request sharing if the module is imported in an SSR path.

### Isolate React state logic from rendering

Create a `useGreeting` hook that owns the generated query options and a small greeting component that only
renders pending, error or success output. Replace the page's direct greeting rendering with this client
component while retaining `getGreeting` as the supported direct-call example for Server Components.

Alternative considered: convert the whole page to a Client Component. Rejected because TanStack Query only
requires a narrow client boundary and the remaining page benefits from staying server-rendered.

### Treat hydration as an explicit opt-in

Document the future prefetch/dehydrate/hydrate flow, but do not add a hydration boundary until a route
actually prefetches data. When introduced, the query client must use the oRPC-supported serializer for any
non-JSON-native values and a non-zero stale time to avoid immediate client refetches.

Alternative considered: install full hydration infrastructure now. Rejected as unused complexity for a
string-only greeting and contrary to the repository's minimal-change rule.

### Record the durable decision separately

Add an accepted ADR for TanStack Query as the browser server-state layer and update ADR-0004 to mention the
integration evidence without prematurely accepting the broader oRPC evaluation. The architecture overview
and usage guide will describe the final responsibility split.

## Risks / Trade-offs

- [A root provider adds client-side JavaScript to every route] -> Keep the provider minimal and move it to a
  narrower layout if a future route does not consume interactive business state.
- [A cross-origin API can be misconfigured too broadly] -> Terminate public traffic at the Worker, use an
  exact origin allowlist and cover preflight plus credential behavior in deployment tests.
- [The greeting now appears after hydration instead of during the initial server render] -> Keep the loading
  state explicit; future content-sensitive routes can adopt documented prefetch and hydration.
- [Two retry layers could duplicate requests] -> Use TanStack Query retry settings only and do not add the
  oRPC client retry plugin.
- [Cache identity can be corrupted by custom keys] -> Prefer generated `.key()` and `.queryKey()` helpers;
  custom keys require a documented exceptional reason.
- [Native values can be lost during future SSR hydration] -> Require the oRPC-supported serializer when a
  prefetched contract contains Date, BigInt, Set, Map or similar values.

## Migration Plan

1. Add pinned frontend dependencies and regenerate the pnpm lockfile.
2. Add the query client factory, provider, oRPC query utilities, hook and greeting component.
3. Replace only the greeting display path; retain the direct API function for server-side consumers.
4. Add tests for validated success, failure, generated query identity and cache reuse.
5. Update README, the oRPC guide, architecture overview and ADRs.
6. Run frontend tests, workspace lint, type checks and the complete production build.

Rollback removes the provider and query-specific frontend files/dependencies and restores the page's direct
`getGreeting` call. No backend, schema or wire-protocol rollback is required.
