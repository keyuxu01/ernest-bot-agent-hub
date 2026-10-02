## 1. Shared Contract Package

- [x] 1.1 Rename `packages/types` to `packages/contracts`, rename the package to `@repo/contracts`, preserve explicit public exports, and verify the workspace discovers the renamed package.
- [x] 1.2 Add Zod as a direct runtime dependency of `@repo/contracts`, update the lockfile, and verify a clean dependency installation resolves Zod from the contract package.
- [x] 1.3 Replace the handwritten greeting interface with `GreetingResponseSchema` and its inferred `GreetingResponse` type, then verify explicit exports expose both symbols.
- [x] 1.4 Add runtime contract tests covering valid and invalid greeting payloads and verify the contract package test suite passes.

## 2. Consumer Migration

- [x] 2.1 Replace every `@repo/types` workspace dependency and import in the Next.js client and both NestJS services with `@repo/contracts`, then verify repository search finds no stale package references.
- [x] 2.2 Parse the business-service JSON response in the Next.js API client with the shared schema and verify valid data is returned while malformed data rejects explicitly.
- [x] 2.3 Apply the shared schema at the NestJS response boundaries and update unit/e2e tests to verify both services still return contract-valid greeting payloads.

## 3. Rules and Documentation

- [x] 3.1 Update `.rulesync/rules/frontend.md` so external API/MCP data uses runtime schemas while props, hooks, and transient UI state may remain in `types/`, then regenerate rules and verify `rulesync generate --check` passes.
- [x] 3.2 Update README and OpenSpec repository context references from `packages/types` / `@repo/types` to `packages/contracts` / `@repo/contracts`, then verify repository search finds no stale documentation references outside historical change artifacts.

## 4. Workspace Verification

- [x] 4.1 Run focused lint, type-check, runtime tests, and builds for `@repo/contracts` and all three consuming applications; fix any contract integration failures.
- [x] 4.2 Run root Turbo lint, type-check, and build plus both NestJS test suites, and verify all tasks pass from the workspace root.
- [x] 4.3 Confirm no nested lockfile, nested Git directory, or new `.tsbuildinfo` was introduced and verify the final diff contains only the planned migration and documentation changes.
