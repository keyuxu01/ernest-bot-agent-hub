---
name: setup-turbo-nest-service
description: Create or integrate a NestJS service in an existing pnpm/Turborepo workspace, including shared TypeScript and ESLint configuration, Turbo task participation and caching, environment handling, shared frontend/backend contracts, and verification. Use when adding a Nest backend to a Turborepo or repairing a Nest app that behaves like a standalone project; do not use for standalone Nest repositories.
---

# Setup Turbo Nest Service

Make the Nest service a first-class workspace package. Adapt to the repository instead of copying a fixed template.

## Inspect before changing

Read the root `package.json`, workspace declaration, `turbo.json`, shared TypeScript and lint packages, existing app conventions, package manager and working-tree status. Inspect the Nest app if it already exists.

Explain material mismatches before editing. In particular, distinguish framework-template defaults from repository conventions. Preserve unrelated changes and do not initialize nested Git metadata or a second lockfile.

## Integrate the service

- Use the root package manager and workspace protocol for internal packages.
- Give the Nest package scripts matching the root Turbo task names. A root `turbo run dev` does not run a package that only has `start:dev`; add or map `dev` when appropriate. Do the same for `build`, `lint`, and `check-types`.
- Declare shared configuration packages as direct `workspace:*` dependencies. Do not rely on dependency hoisting.
- Extend the repository TypeScript base and retain only justified Nest-specific overrides such as decorators, output location, source maps, and framework-required strictness exceptions. Follow the repository's incremental-compilation policy. If `.tsbuildinfo` appears, identify which effective `incremental` setting produced it; do not attribute it to Turbo.
- Make lint sharing real: the app's lint command and config must actually consume the shared preset. Merely adding the shared package to `package.json` is insufficient. Add a reusable Node/test preset to the shared lint package only when the repository lacks one.
- Add the Nest output directory, usually `dist/**`, to the Turbo build outputs without removing outputs for other frameworks.
- Declare environment variables using the repository's Turbo policy. Use pass-through variables for runtime-only values that should not affect cache keys; use hashed environment inputs when they can change task output.
- Check development ports across apps. Ensure one root development command can start the intended packages without collision.

## Shared contracts

When the repository has both frontend and backend consumers, or the user requests shared types, create or reuse a dedicated workspace contract package. Read [shared-contracts.md](references/shared-contracts.md) before choosing its export/build strategy.

Wire at least one real boundary when the task includes end-to-end integration: type the Nest request or response, declare the package in each actual consumer, and type the frontend API client. Do not add unused consumer dependencies just to make the graph look connected.

## Verify

Run the narrow app checks first, then root Turbo `lint`, `check-types`, and `build`. Run the service's unit and e2e tests when present. For a requested frontend/backend connection, start both services, exercise the API, confirm the frontend receives or renders the response, and stop the processes.

Run the read-only verifier when its assumptions fit the repository:

```bash
python3 scripts/verify_workspace.py <workspace-root> <nest-app-relative-path> [--require-types]
```

Treat verifier warnings as investigation prompts, not automatic authorization to rewrite project conventions.

Before finishing, confirm no new `.tsbuildinfo`, nested lockfile, or nested `.git` directory was accidentally introduced. Report behavior changes such as ports or response shapes explicitly.
