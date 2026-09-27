## Why

The monorepo currently shares compile-time-only TypeScript declarations through `@repo/types`, so API and MCP payloads can drift or accept invalid runtime data without detection. The knowledge-base system needs one executable contract source that frontend, NestJS services, and MCP widgets can validate and infer consistently.

## What Changes

- **BREAKING** Rename the `packages/types` workspace package from `@repo/types` to `@repo/contracts`.
- Define cross-application request, response, and MCP payload contracts as Zod schemas.
- Derive shared TypeScript input and output types from the schemas instead of maintaining parallel interfaces.
- Update the Next.js client and both NestJS services to consume the new contract package and validate data at their external boundaries.
- Keep frontend-only component props, hook types, and transient UI state as TypeScript types; they do not require runtime schemas.
- Update frontend coding rules and repository documentation to describe the schema/type boundary.

## Capabilities

### New Capabilities

- `shared-runtime-contracts`: Runtime-validatable, type-inferred contracts shared across frontend, backend, and MCP boundaries.

### Modified Capabilities

None.

## Impact

- Affects `packages/types`, which becomes `packages/contracts`, plus its workspace metadata and lockfile importer.
- Affects imports and dependencies in `apps/agentic-rag-client`, `apps/agentic-rag-business-service`, and `apps/mcp-app-collections`.
- Adds Zod as a direct runtime dependency of the shared contract package.
- Changes the frontend RuleSync source and generated rule files so cross-boundary types come from schemas while local UI-only types may remain in `types/`.
- Requires all workspace lint, type-check, test, and build tasks to remain green after the package rename.
