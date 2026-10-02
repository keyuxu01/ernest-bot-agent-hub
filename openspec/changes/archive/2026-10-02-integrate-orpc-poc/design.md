## Context

> Archive correction (2026-10-02): Subsequent module-boundary verification established that the NestJS deployment units use CommonJS package boundaries with NodeNext resolution. This correction updates only that architectural premise; the archived change scope and completion record are unchanged.

See `proposal.md` for motivation and `specs/typed-business-api/spec.md` for observable requirements. Today the Next.js server component calls a hand-written `fetch` wrapper, the NestJS service exposes `GET /`, and both sides share only `GreetingResponseSchema` from `@repo/contracts`.

The repository uses CommonJS NestJS deployment units with NodeNext module resolution, Node.js 24+, Zod 4 and explicit compiled package exports. NodeNext type-checks the ESM-only oRPC packages correctly, while Node.js 24 allows the emitted CommonJS code to load them through synchronous `require(ESM)`. Those constraints match the stable oRPC v1 NestJS integration requirements. This PoC evaluates only npm `latest` releases and excludes `beta`, `next` and other prerelease tags.

## Goals / Non-Goals

**Goals:**

- Establish one end-to-end contract-first route across the shared package, NestJS service and Next.js client.
- Keep base Zod schemas independent from oRPC runtime imports.
- Exercise server output validation, client response validation and generated OpenAPI output.
- Preserve a low-cost rollback to the existing fetch-and-Zod implementation.

**Non-Goals:**

- Accepting oRPC as the permanent repository-wide business API protocol.
- Designing knowledge-base resources before their domain model exists.
- Completing the ADR-0004 authentication, mutation and typed-business-error evaluation.
- Moving AI streaming or MCP traffic onto oRPC.
- Adding an interactive Swagger or Scalar UI; a JSON OpenAPI document is sufficient for the PoC.

## Decisions

### Use contract-first oRPC stable v1 packages as one compatible set

The implementation will install exact stable releases from the npm `latest` tag: `@orpc/contract`, `@orpc/server`, `@orpc/client`, `@orpc/openapi`, `@orpc/openapi-client` and `@orpc/zod` at `1.15.4`, plus `@orpc/nest` at `1.15.3`. The lockfile records the tested versions and no dependency range may resolve to a prerelease.

This prioritizes operational stability while still evaluating the oRPC architecture. The v2 beta line was rejected because the user explicitly requires stable dependencies. Upgrading to v2 can be evaluated separately after it reaches the npm `latest` tag.

### Isolate the RPC contract behind `@repo/contracts/orpc`

`packages/contracts` will keep `GreetingResponseSchema` on its existing root export. A dedicated subpath will export a router contract whose greeting operation has explicit OpenAPI metadata for `GET /api/greeting`, no input payload, and `GreetingResponseSchema` output.

This prevents MCP and ordinary schema consumers from loading oRPC transitively. Putting the contract in the NestJS app was rejected because the frontend would then depend on backend source. Adding a new package for one operation was rejected as premature; a separate package can be introduced if the RPC surface becomes large.

### Implement the contract through `@orpc/nest` and existing services

The NestJS `GreetingRpcController` uses the official contract implementation decorator and delegates to
`GreetingService`; it does not duplicate the greeting business behavior. `GreetingModule` owns the controller
and service, while the root application module configures the oRPC Nest integration and centralized error
logging without exposing internal errors.

The existing `GreetingController.getHello()` and `GET /` remain unchanged during the PoC. This gives a direct compatibility test and rollback path.

### Use an OpenAPI link with client-side response validation

The Next.js `lib/api.ts` wrapper will construct a server-side oRPC OpenAPI client from the shared contract and `API_BASE_URL`. It will enable the contract response-validation link plugin so a malformed remote payload is rejected on the client as required by the existing test behavior.

Using an RPC-specific wire handler was considered. OpenAPI transport is preferred because interoperability and generated documentation are explicit ADR evaluation goals. The UI continues to call only `getGreeting()`, so protocol details stay out of React components.

### Serve OpenAPI JSON through an explicit NestJS route

An OpenAPI generator configured with the Zod 4 schema converter will generate a document from the shared contract. A normal NestJS controller route will return that document at `/openapi.json`.

The oRPC OpenAPI reference plugin was considered, but the official NestJS guidance notes that Nest can return 404 before unmatched handler plugins run. An explicit controller is predictable and easy to verify in e2e tests.

### Test package boundaries and both transport paths

Contract tests will verify the shared schemas and export surface. NestJS unit/e2e tests will verify the oRPC greeting route, OpenAPI JSON and legacy route. Client tests will inject or mock fetch through the link and cover valid, malformed and unavailable responses. Root lint, type-check, tests and build complete the PoC verification.

## Risks / Trade-offs

- **[Future v2 migration]** Stable v1 APIs may require changes when v2 becomes stable. → Pin exact v1 versions, keep integration code narrow, and evaluate v2 only through a separate dependency-upgrade change.
- **[Duplicate routes during evaluation]** `/` and `/api/greeting` expose the same behavior. → Treat `/` as an explicit temporary compatibility route and do not add new features to both independently.
- **[Contract package gains optional protocol dependencies]** The shared package now owns oRPC contract code. → Use a separate package export and verify the root export graph remains oRPC-free.
- **[Client validation adds work]** Server and client both validate output. → Accept the small cost for the PoC because the trust boundary and malformed-response test are intentional; remeasure for large payloads later.
- **[OpenAPI route can expose internal metadata]** Generated documentation is externally accessible. → Include only public PoC operations and no secrets, internal errors or authentication material.

## Migration Plan

1. Add the isolated contract subpath and tests without changing existing consumers.
2. Add the NestJS oRPC route and OpenAPI JSON route while retaining `GET /`.
3. Switch only the Next.js greeting wrapper to the typed client and verify its fallback UI.
4. Run focused tests followed by root lint, type-check, test and build.
5. Record the observed PoC result in ADR-0004 while retaining Proposed status.

Rollback consists of restoring `lib/api.ts` to the current fetch implementation, removing the new NestJS route/module and contract subpath, and removing the oRPC dependencies. The legacy endpoint remains available throughout.
