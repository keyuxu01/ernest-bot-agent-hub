## 1. Dependency Setup

- [x] 1.1 Add exact stable `@orpc/tanstack-query@1.15.4` and `@tanstack/react-query` v5 dependencies to `agentic-rag-client`, regenerate `pnpm-lock.yaml`, and verify `pnpm install --frozen-lockfile` succeeds.

## 2. Query Infrastructure

- [x] 2.1 Add a named stale-time constant and a QueryClient factory with explicit browser cache defaults, and verify a unit test observes the configured default.
- [x] 2.2 Add a root client Provider that creates exactly one QueryClient per mount, wire it into the Server Component root layout, and verify frontend type checking accepts the server/client boundary.
- [x] 2.3 Export the existing typed oRPC client and create one `createTanstackQueryUtils` utility tree without constructing a second transport, then verify generated greeting query keys are stable.
- [x] 2.4 Make browser calls use the public Cloudflare API base URL, document the local development origin, and verify the client does not require a Vercel same-origin rewrite.

## 3. Greeting Query Slice

- [x] 3.1 Add a `useGreeting` hook and a presentation-only greeting component for pending, error and success states, then verify both follow the frontend export and dependency-direction rules.
- [x] 3.2 Replace the home page's direct greeting display with the narrow client component while retaining `getGreeting` for direct Server Component calls, and verify the page still builds as a Server Component.
- [x] 3.3 Add query integration tests covering contract-valid success, malformed-response rejection, unavailable-service failure, generated-key invalidation and fresh-cache reuse without a second request.

## 4. Architecture and Usage Documentation

- [x] 4.1 Add an accepted ADR for TanStack Query as the browser server-state layer and update ADR-0004 plus the architecture overview to document the oRPC/TanStack Query boundary.
- [x] 4.2 Update the root README and oRPC guide with setup, query, mutation/invalidation and opt-in SSR hydration examples, and explicitly preserve the AI streaming and MCP protocol boundaries.
- [x] 4.3 Record the accepted Vercel plus Cloudflare Worker/Container deployment boundary, including CORS ownership and scheduled-job responsibilities.

## 5. Verification

- [x] 5.1 Run Prettier and the frontend test suite, and resolve every formatting or test failure.
- [x] 5.2 Run workspace lint, type checks and the full production build, and confirm all tasks complete without warnings promoted to failures.
- [x] 5.3 Run `openspec validate integrate-orpc-tanstack-query --strict` and confirm the change artifacts and completed task state are valid.
