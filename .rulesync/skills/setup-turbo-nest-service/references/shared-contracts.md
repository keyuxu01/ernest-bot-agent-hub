# Shared frontend/backend contracts

Choose the lightest contract strategy that matches the repository.

## Type-only workspace package

Use this for private monorepos where frontend and backend compile together and runtime payload validation is handled elsewhere.

- Prefer a focused package such as `@repo/types` or the repository's existing contract package.
- Export domain-oriented request, response, event, and error types from stable entry points.
- Use `import type` when a consumer needs no runtime value.
- Follow the repository's internal-package convention: source exports are suitable for just-in-time packages; compiled `dist` exports require a build task and correct Turbo dependency/output configuration.
- Avoid a `dist` export that makes clean `check-types` fail before the package has been built.

TypeScript types disappear at runtime. An interface on a Nest controller does not validate untrusted JSON.

## Runtime schemas or DTO classes

Use runtime-capable contracts when payload validation, parsing, or generated documentation is required.

- Reuse the repository's existing validation system rather than introducing a new schema library without need.
- A Nest DTO class can support decorators and runtime metadata, but check whether importing it into the frontend also imports server-only dependencies.
- A shared schema can derive static types and validate at both boundaries when the stack already supports that pattern.

Keep transport contracts separate from persistence entities and internal service models. Do not expose database records as public API types merely because they are convenient.

## API clients

Put the shared type at the actual network boundary. A typed function signature documents the contract, but a cast of `response.json()` is still trust, not validation. Add runtime parsing when malformed or hostile payloads are in scope.

For server-side frontend requests, CORS is normally irrelevant. For browser-side requests, configure narrowly scoped CORS and avoid permissive production defaults.
