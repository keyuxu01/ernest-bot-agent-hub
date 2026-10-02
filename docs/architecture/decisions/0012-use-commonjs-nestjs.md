# ADR-0012: Use CommonJS NestJS Applications with NodeNext

- Status: Accepted
- Date: 2026-10-02

## Context

The repository deploys two private NestJS applications and shares runtime Zod and oRPC contracts through
`@repo/contracts`. NestJS applications conventionally emit CommonJS, which permits extensionless relative
imports and interoperates with the repository's older CommonJS dependencies.

oRPC itself is ESM-only. Its official NestJS guidance recommends TypeScript `NodeNext` and Node.js 22 or
newer for projects that load ESM packages from NestJS. The repository requires Node.js 24 or newer. A local
verification compiled `@repo/contracts` to CommonJS, emitted `require("@orpc/contract")`, and successfully
loaded every oRPC entry used by the business service on Node.js 24.

Turborepo distinguishes task orchestration from package runtime format. It can ensure a shared package builds
before its consumers, but it does not transform CommonJS and ESM boundaries by itself. The contract package
therefore needs explicit compiled exports that match its consumers.

## Decision

- Keep `agentic-rag-business-service` and `mcp-app-collections` as CommonJS package boundaries by omitting
  `"type": "module"` from their package manifests.
- Keep TypeScript `module` and `moduleResolution` set to `NodeNext`. With a CommonJS package boundary this
  emits `require` calls while modelling Node.js 24 package exports and synchronous `require(ESM)` support.
- Require Node.js 24 or newer for backend builds and production processes.
- Use extensionless relative imports in NestJS source, tests and shared contract source.
- Build `@repo/contracts` as CommonJS before its consumers. Its root and `/orpc` exports expose declarations
  through `types` and the same `dist` JavaScript artifacts through `require`, `import` and `default`.
- Never route a production contract-package condition to `src/*.ts`; Next.js, NestJS and MCP consumers share
  compiled artifacts rather than relying on consumer-specific TypeScript transpilation.
- Keep declaration output disabled for the private NestJS applications and enabled for shared packages.
- Verify module changes with type-checks, builds, emitted-output inspection and direct Node.js loading probes
  for the oRPC entry points used by the backend.

## Consequences

- Backend source follows ordinary NestJS import ergonomics without `.ts` or `.js` suffixes.
- The services retain oRPC without converting the whole backend to native ESM or introducing a production
  bundler.
- CommonJS and ESM-aware consumers resolve one built contract implementation and one set of declarations.
- Node.js 24 is an architectural runtime requirement, not only a development preference.
- An ESM dependency that introduces top-level await may no longer be synchronously requireable. Dependency
  upgrades must run the module-loading probes and treat `ERR_REQUIRE_ASYNC_MODULE` as an incompatibility.
- The private applications no longer emit unused declaration files; `@repo/contracts` continues to do so.

## Alternatives

- Native ESM NestJS applications: technically valid, but rejected because it spreads explicit-extension and
  CommonJS-interoperability costs across every backend file when Node.js 24 already supports the required oRPC
  boundary.
- A just-in-time contracts package that exports `src/index.ts`: rejected for production runtime conditions
  because plain Node.js services should not depend on a consumer bundler or workspace TypeScript source.
- Separate CommonJS and ESM contract builds: deferred until a real consumer cannot load the CommonJS artifact;
  the private workspace does not currently justify duplicate outputs.
- Bundle the complete NestJS applications: rejected because it adds another build and debugging boundary only
  to solve interop already provided by the supported Node.js runtime.

## References

- [oRPC NestJS integration and ESM requirements](https://orpc.dev/docs/integrations/nest)
- [Node.js packages and module loading](https://nodejs.org/api/packages.html)
