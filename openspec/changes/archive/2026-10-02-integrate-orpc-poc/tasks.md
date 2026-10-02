## 1. Dependencies and Shared Contract

- [x] 1.1 Install the exact npm-stable oRPC v1 dependency set (`1.15.4`, with `@orpc/nest` at `1.15.3`) in the owning workspaces, update `pnpm-lock.yaml`, and verify `pnpm install --frozen-lockfile` succeeds with no prerelease oRPC package.
- [x] 1.2 Add the `@repo/contracts/orpc` export with a contract-defined `GET /api/greeting` operation that reuses `GreetingResponseSchema`, and verify contract tests plus package build demonstrate that the root export remains usable without the oRPC subpath.

## 2. NestJS Contract Implementation

- [x] 2.1 Configure the official oRPC NestJS module and implement the greeting contract in `GreetingModule` by
      delegating from `GreetingRpcController` to `GreetingService`, then verify focused controller tests cover a
      contract-valid result.
- [x] 2.2 Generate OpenAPI from the shared contract and expose it at `GET /openapi.json`, then verify e2e tests assert the greeting path, method and response schema are present.
- [x] 2.3 Extend e2e coverage for `GET /api/greeting` while retaining the existing `GET /` assertions, and verify both routes return the same contract-valid greeting.

## 3. Next.js Typed Client

- [x] 3.1 Replace the hand-written greeting transport with a server-side oRPC OpenAPI client configured from `API_BASE_URL` and the response-validation plugin, then verify client tests cover valid, malformed and unreachable responses.
- [x] 3.2 Verify the existing page still renders the greeting on success and its unavailable-service fallback on failure without importing backend source into the frontend.

## 4. Documentation and Repository Verification

- [x] 4.1 Update ADR-0004 and the architecture overview with the implemented PoC facts while keeping the decision Proposed, then verify the documented endpoint, package boundary and remaining evaluation criteria match the code.
- [x] 4.2 Run package tests and e2e tests followed by root lint, type-check, test and build, and resolve every failure before marking the PoC complete.
