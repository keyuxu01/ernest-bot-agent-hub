# ADR-0005: Evaluate `@rekog/mcp-nest` v2 for the MCP Service

- Status: Proposed
- Date: 2026-09-27

## Context

`mcp-app-collections` is a NestJS application that must expose MCP Tools, Resources, Prompts and MCP App
widgets. Building directly on the official TypeScript SDK is reliable but requires custom integration for
NestJS dependency injection, lifecycle, guards, interceptors, exception filters and transport setup.

## Proposed Decision

Use `@rekog/mcp-nest` v2 for a focused proof of concept. Adopt its v2 Strategy API based on `McpStrategy`,
`@McpController()` and NestJS microservice handlers. Do not copy examples based on the v1
`McpModule.forRoot()` API or the removed HTTP+SSE transport.

Continue defining reusable payload schemas in `@repo/contracts`. MCP handlers remain protocol adapters and
delegate business behavior to services or use cases. The official MCP TypeScript SDK v2 remains the fallback
if the NestJS wrapper blocks required protocol functionality.

## Stability Check

As of 2026-09-27, `@rekog/mcp-nest` v2 is a stable release line: npm publishes `2.0.7` under the `latest`
tag, and the required `@modelcontextprotocol/core`, `@modelcontextprotocol/node` and
`@modelcontextprotocol/server` packages publish stable `2.1.0` releases under `latest`. The core framework
is therefore eligible for the PoC without prerelease dependencies.

The built-in authorization-server feature is still documented as Beta. The first PoC must either omit it or
use an external authorization server; adopting the built-in authorization server requires a separate review.

## Acceptance Criteria

- Streamable HTTP works with the MCP Inspector and the intended Agent hosts.
- Tools, Resources and Prompts can use NestJS dependency injection naturally.
- Guards, pipes, interceptors and exception filters behave consistently on MCP handlers.
- Tool input and structured output reuse Zod schemas without duplicate payload definitions.
- MCP App Resources and ChatGPT Apps `_meta` can be returned without leaking host metadata into domain code.
- Authentication, stateless deployment, cancellation and error mapping are covered by integration tests.
- The application passes lint, type-check, unit tests, e2e tests and production build.

## Consequences if Accepted

- The MCP service gains Nest-native discovery and lifecycle behavior with less custom adapter code.
- The project depends on a community NestJS integration in addition to the official MCP SDK packages.
- Major `@rekog/mcp-nest` upgrades require checking both its migration guide and the MCP specification revision.

## Alternatives

- Official MCP TypeScript SDK v2 directly: most authoritative and retained as the fallback, but requires more
  NestJS integration code.
- `@bamada/nestjs-mcp`: rejected for the PoC because its documented peer stack targets MCP SDK v1, Zod 3 and
  NestJS 10/11 rather than the repository's current stack.
- A custom MCP framework: rejected because it duplicates protocol and NestJS integration work.
