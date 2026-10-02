## Why

The accepted Cloudflare Containers topology leaves the always-on RabbitMQ Consumer runtime unresolved and no longer matches the decision to run the NestJS backend on Railway. The deployment contract also needs product-scoped public domains so additional applications can be introduced without reserving generic root or `api` hostnames for one workload.

## What Changes

- **BREAKING** Replace the planned Cloudflare Worker/Containers backend ingress and runtime with Railway services for the Agentic RAG NestJS API and continuously running RabbitMQ Consumer.
- Keep the Next.js frontend on Vercel and Cloudflare as the authoritative DNS provider, but expose this product at `know-research.ernestbot.com` instead of the apex domain.
- Expose the product's public NestJS API at `know-research-api.ernestbot.com` instead of the generic `api.ernestbot.com` hostname.
- Replace Cloudflare Cron as the default schedule owner with short-lived Railway Cron publisher services that publish versioned, idempotent commands to RabbitMQ and then exit; keep critical execution in the always-on Consumer.
- Keep production RabbitMQ, Redis, PostgreSQL, object storage and vector storage external to stateless Railway application services, preserving the existing managed-service and state-ownership boundaries.
- Document the Railway/Turborepo deployment model: repository-root builds, per-service Turbo filters and start commands, shared-package-aware Watch Paths, optional Vercel Remote Cache, and future `turbo prune --docker` optimization.
- Add a replacement ADR and reconcile the architecture overview, deployment guide, oRPC domain examples and superseded ADR references with the new topology.

## Capabilities

### New Capabilities

- `railway-deployment`: Defines the product-scoped domain contract, Vercel/Railway workload placement, Railway API/Consumer/Cron process boundaries, managed state-service boundaries and Turborepo-aware deployment behavior.

### Modified Capabilities

None. The repository currently has no main OpenSpec capability specifications to modify.

## Impact

- Documentation: `docs/architecture/README.md`, `docs/guides/deployment-and-infrastructure.md`, `docs/guides/orpc.md`, a new replacement ADR, and status/cross-reference updates to affected deployment ADRs.
- Public configuration contract: production frontend and API origins change to `know-research.ernestbot.com` and `know-research-api.ernestbot.com` before either origin has been provisioned.
- Deployment model: Vercel hosts `agentic-rag-client`; Railway separately hosts the NestJS API, always-on Consumer and one-shot Cron publisher services.
- Build model: Railway services build the shared pnpm/Turborepo workspace from the repository root and must redeploy when relevant shared packages or root build metadata change.
- Scheduling: ordinary API replicas do not own production-critical `@Cron()` schedules; Railway Cron only creates durable commands, while RabbitMQ and the Consumer own delivery and execution.
- Architecture governance: ADR-0011 records the selected topology and aligns the affected compute-platform statements in ADR-0007 and ADR-0009 without replacing the accepted RabbitMQ and Redis responsibility boundaries.
- Runtime diagnostics: the existing `/health/whoami` response reads Railway-provided replica, deployment and commit metadata instead of retired Cloudflare deployment identifiers.
