## Context

> Archive correction (2026-10-02): Subsequent module-boundary verification established CommonJS package boundaries for the NestJS deployment units and compiled CommonJS output for `@repo/contracts`. This correction updates only that architectural premise; the archived change scope and completion record are unchanged.

See `proposal.md` for motivation. The repository currently has a just-in-time `@repo/types` workspace package containing one `GreetingResponse` interface. The Next.js client and both NestJS services import that compile-time type, but no runtime validator exists. Once schemas become runtime values, CommonJS NestJS services and ESM-aware frontend tooling need one stable package boundary, so the contract package must provide compiled JavaScript and declarations instead of a TypeScript source fallback.

The change crosses three applications, a shared package, the pnpm workspace lockfile, RuleSync-generated instructions, and repository documentation. The initial greeting contract is the migration proof; future knowledge-base API and MCP contracts will follow the same structure.

## Goals / Non-Goals

**Goals:**

- Establish `@repo/contracts` as the single source of truth for cross-application payload schemas and inferred types.
- Make runtime validation available at HTTP and MCP trust boundaries.
- Provide compiled JavaScript and declarations so Node.js and application bundlers consume the same package boundary.
- Define a clear exception for frontend-local props, hook types, and presentation state.

**Non-Goals:**

- Define the future knowledge-base domain contracts in this migration.
- Require runtime schemas for purely internal TypeScript types.
- Add API documentation generation, persistence schemas, or NestJS DTO decorators.
- Introduce a compatibility alias for `@repo/types`; the repository will migrate atomically.

## Decisions

### Rename the package to `@repo/contracts`

The workspace directory becomes `packages/contracts` and the package name becomes `@repo/contracts`. “Contracts” describes both runtime schemas and inferred static types and remains appropriate when MCP request/response schemas are added.

Alternatives considered:

- Keep `@repo/types`: rejected because the package will export runtime values and the name reinforces compile-time-only usage.
- Use `@repo/schemas`: workable, but narrower than the package's role as the shared boundary contract between producers and consumers.

### Treat runtime schemas as the source of truth

Each boundary model will export a named schema and types inferred from that schema. A schema with transforms will expose input and output types explicitly; a schema without transforms can expose its inferred output type. Handwritten duplicates of the same payload shape are not allowed.

The initial migration replaces `GreetingResponse` with `GreetingResponseSchema` plus an inferred `GreetingResponse` type. Barrel files remain explicit and contain no implementation logic.

### Add Zod as a direct runtime dependency

`@repo/contracts` will declare Zod in `dependencies`, not `devDependencies`, because exported schemas execute at runtime. Consumers depend only on `@repo/contracts`; they do not rely on a transitive or hoisted Zod installation.

Zod is already present transitively in the lockfile, but the workspace package must declare it directly to make ownership explicit.

### Validate at trust boundaries

The Next.js API client will parse `response.json()` before returning data. NestJS and MCP handlers will use shared schemas where data enters or exits an external boundary, while internal code can use the inferred types after validation.

This design does not require every internal function to parse data repeatedly. Validation occurs once at the boundary and typed values flow inward.

### Keep frontend-local `types/` directories

Component props, hook signatures, and transient UI state remain compile-time-only when they do not model external data. Frontend rules will distinguish `schemas/` for runtime boundary models from `types/` for local UI contracts.

This avoids unnecessary runtime schemas for presentation details while preventing duplicated API or MCP payload declarations.

### Compile contracts before application consumers

`@repo/contracts` compiles CommonJS JavaScript and declarations into `dist` and exposes only those artifacts through package exports. Its `require`, `import`, and `default` runtime conditions resolve to the same compiled `.js` files. Turbo builds dependency packages before application builds and type-checks, so clean workspace commands do not depend on stale local artifacts. The package does not provide a source fallback: a missing build should fail explicitly instead of changing runtime resolution between tools.

This follows the proven compiled CommonJS schema-package shape used by `ai-engine-alpha`, while retaining explicit exports and removing its source fallback. A separate `tsconfig.build.json` excludes tests from distributable artifacts while the regular TypeScript configuration continues checking them.

## Risks / Trade-offs

- [Risk] Renaming the package breaks every remaining `@repo/types` import. → Migrate the directory, package name, workspace dependencies, source imports, documentation, and lockfile in one change; verify with repository-wide search.
- [Risk] Parsing outbound data everywhere can add redundant validation. → Validate only at defined trust boundaries and avoid repeated parsing inside already trusted application layers.
- [Risk] Schema transforms can make input and output types easy to confuse. → Require explicit input/output aliases when transforms are present and document their intended boundary.
- [Risk] Runtime schemas increase browser bundle size. → Export domain-focused schemas and avoid importing unrelated contract modules through broad runtime barrels in client bundles.
- [Risk] Frontend rules could incorrectly demand schemas for all local types. → State the external-boundary criterion explicitly and retain `types/` for UI-only declarations.
- [Risk] Consumers resolve missing or stale `dist` artifacts. → Export only `dist` and make Turbo type-check/build tasks depend on dependency builds, ensuring clean orchestration and failing direct consumption when the package has not been built.

## Migration Plan

1. Rename the workspace directory and package to `packages/contracts` / `@repo/contracts`.
2. Add Zod as a direct runtime dependency, compile the package to `dist`, and convert the greeting interface into a schema-derived contract.
3. Update all workspace consumers and add boundary parsing where external JSON is consumed.
4. Update RuleSync source rules, regenerate target-specific rule files, and update repository documentation/configuration references.
5. Update the pnpm lockfile and run package-level checks followed by root Turbo lint, type-check, test where defined, and build.
6. Confirm that no `@repo/types` imports or `packages/types` references remain.

Rollback is an atomic revert of the package rename, consumer imports, validation calls, rule changes, and lockfile update.
