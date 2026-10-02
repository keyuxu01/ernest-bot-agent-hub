## Context

See `proposal.md` for the motivation and `specs/railway-deployment/spec.md` for the required deployment behavior.

The current accepted documentation places the Next.js frontend on Vercel, the public ingress and NestJS API on Cloudflare Worker/Containers, and leaves the always-on RabbitMQ Consumer provider unresolved. It already requires RabbitMQ for durable asynchronous work, Redis only for cache and coordination, a database for durable facts and idempotency, and separate API and Consumer lifecycles. No production resource has been provisioned, so the domain and runtime migration is a documentation and decision migration rather than a live traffic cutover.

The repository is a shared pnpm/Turborepo workspace. Both `agentic-rag-client` and `agentic-rag-business-service` depend on workspace packages, particularly `@repo/contracts`, so deployment builds cannot treat their application directories as isolated roots.

## Goals / Non-Goals

**Goals:**

- Select Railway as the production runtime for the NestJS API, always-on Consumer and short-lived scheduled command publishers.
- Preserve Vercel for the Next.js frontend and Cloudflare for authoritative DNS.
- Allocate stable, product-scoped frontend and API origins that leave the apex and generic hostnames available for future routing decisions.
- Make API, Consumer and schedule-publisher lifecycle differences explicit.
- Define a Railway build model that respects the pnpm workspace dependency graph and can reuse Turbo task artifacts safely.
- Reconcile architecture documentation and ADR status before any infrastructure implementation begins.

**Non-Goals:**

- Provision Vercel, Railway, DNS, RabbitMQ, Redis, PostgreSQL, object storage or vector storage resources.
- Add Dockerfiles, Railway config files, deployment scripts, environment secrets or CI workflows.
- Implement RabbitMQ publishers/consumers, Redis adapters, database records, CORS or dependency-aware readiness indicators.
- Select concrete managed RabbitMQ, Redis, database, object-storage or vector-storage vendors.
- Introduce Kubernetes or move the Next.js frontend from Vercel to Railway.

## Decisions

### Use product-prefixed single-label subdomains

The frontend uses `know-research.ernestbot.com`; the public business API uses `know-research-api.ernestbot.com`. Cloudflare remains authoritative for the zone, while each record targets the hosting platform selected for that workload. Both initial records should use DNS-only mode unless a later ADR intentionally adds Cloudflare proxying and owns the resulting TLS, caching and request-policy behavior.

Single-label subdomains avoid assigning this product the apex or generic `api` namespace and avoid the certificate and proxy complications of deeper names such as `api.know-research.ernestbot.com`.

Alternatives considered:

- `ernestbot.com` plus `api.ernestbot.com`: rejected because one product would occupy the shared generic namespace.
- `api.know-research.ernestbot.com`: rejected because the additional DNS label complicates default wildcard certificate and proxy behavior without adding a useful boundary.
- `frontend-know-research` and `backend-know-research`: rejected because deployment-role words expose internal implementation rather than stable product-facing roles.

### Keep Vercel for Web and move all NestJS processes to Railway

Vercel continues to host `agentic-rag-client`. Railway hosts separate deployable services sourced from `agentic-rag-business-service`:

| Railway process | Lifecycle                                | Public network                    | Responsibility                              |
| --------------- | ---------------------------------------- | --------------------------------- | ------------------------------------------- |
| Business API    | Always available, independently scalable | `know-research-api.ernestbot.com` | HTTP/oRPC requests and command publication  |
| Consumer        | Always-on, non-scale-to-zero, supervised | No business public origin         | RabbitMQ consumption and use-case execution |
| Cron publisher  | Starts on schedule and exits             | None                              | Publish one scheduled command and terminate |

This selects the previously unresolved Consumer provider and removes Cloudflare Worker/Containers from the required request path. It also keeps all NestJS process types on one container platform while preserving their independent service lifecycles.

The existing `/health/whoami` diagnostic maps Railway's replica and deployment identifiers into its established response contract. When `SERVICE_VERSION` is not explicitly set, the Railway Git commit SHA is the version fallback. These are non-sensitive platform identifiers; secrets and the complete environment remain excluded.

Alternatives considered:

- Cloudflare Containers for API plus Railway for Consumer: rejected because it retains two application compute control planes without a demonstrated requirement.
- Railway for frontend as well: deferred because Vercel provides the more integrated Next.js and Turborepo frontend deployment experience and moving Web is not required to solve the backend lifecycle problem.
- A single Railway service containing API, Consumer and `@Cron()`: rejected because scaling or replacing API replicas would also alter consumer concurrency and scheduled-trigger cardinality.

### Use Railway Cron only as a command producer

Each scheduled entry starts a one-shot application-context process from the same backend workspace. The process derives a deterministic occurrence key from the job identity and scheduled time, publishes a persistent versioned command using RabbitMQ publisher confirmation, closes connections and exits with a meaningful status code. It does not start an HTTP server or execute the long-running business use case.

This keeps normal API replicas free of production-critical `@Cron()` decorators and minimizes Railway's overlapping-run skip risk. A schedule needing sub-five-minute frequency, stronger timing guarantees or durable orchestration must receive a separate scheduler decision rather than silently falling back to API-local scheduling.

Alternatives considered:

- Cloudflare Cron calling a public Railway endpoint: rejected as the default because it adds a public authenticated hop and a second runtime for a trigger that can execute beside the publisher code.
- Dedicated always-on NestJS Scheduler with `@Cron()`: valid only as a later exception with singleton/leader election, persistent occurrence tracking, compensation and an ADR.
- Execute the complete job in Railway Cron: rejected because long work increases overlap/skipping risk and bypasses RabbitMQ delivery, retry and backpressure behavior.

### Keep durable state outside Railway application services

API, Consumer and Cron publisher services are stateless and replaceable. RabbitMQ remains the durable command/event transport; Redis remains cache and short-lived coordination; PostgreSQL or the selected system-of-record database owns business facts, job status and idempotency. Production uses managed durable services or a separately accepted equivalent; Railway's filesystem is never an authority.

This decision does not require all state providers to be outside the Railway vendor boundary, but it does require their service lifecycle, persistence, backup and recovery to be separate from the application containers. A Railway database/template that remains operator-managed cannot be described as managed merely because it is deployed from the Railway catalog.

### Build Railway services from the monorepo root

Railway services retain `/` as their source/build root and use workspace-scoped commands, initially:

```text
Build: pnpm turbo run build --filter=agentic-rag-business-service
API:   pnpm --filter agentic-rag-business-service start:prod
Worker and Cron: dedicated package scripts to be added by later implementation changes
```

Watch Paths include the business-service directory, `packages/contracts`, relevant shared TypeScript configuration, and root workspace/build metadata such as `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `turbo.json`. The exact path set should be narrowed only after dependency changes prove a path irrelevant.

Railpack layer caching is useful but not guaranteed. Railway builds may optionally use Vercel Remote Cache through scoped `TURBO_TOKEN` and `TURBO_TEAM` build credentials so independent API, Consumer and Cron builds can reuse identical Turbo artifacts. A later Docker packaging change may use `turbo prune --docker`; it is not required for this documentation-only change.

### Hash build-time public configuration

`NEXT_PUBLIC_API_BASE_URL` is embedded into client artifacts and therefore must participate in the frontend build-task hash before remote caching is enabled. `PORT` remains runtime-only and can pass through without changing a build hash. `API_BASE_URL` must be classified according to whether the final Next.js packaging reads it at build or runtime; until that behavior is verified, documentation must not promise cache reuse across differing values.

## Risks / Trade-offs

- [Railway becomes the shared failure domain for API, Consumer and Cron startup] → Keep durable state external, use RabbitMQ backlog, restart policies, health monitoring and compensation scans; revisit an external scheduler only when a measured availability requirement justifies it.
- [Railway Cron may start late or skip an occurrence whose prior process is still active] → Keep the publisher short-lived, enforce connection/publish timeouts, alert on non-zero exits and add persistent occurrence/compensation behavior with the messaging implementation.
- [Manual Watch Paths omit a shared dependency and skip a needed deployment] → Begin with the conservative dependency-aware list in this design and validate shared-contract changes in deployment tests.
- [Remote cache restores an artifact built for another environment] → Hash every build-time public variable and keep secrets/runtime-only variables out of artifact hashes.
- [Removing Cloudflare Worker also removes its planned CORS/WAF policy layer] → Configure an exact NestJS/Railway CORS allowlist and document any future WAF/proxy requirement separately rather than assuming Cloudflare owns it.
- [Managed state providers add vendors and cost] → Keep provider access behind adapters and connection URLs so vendor selection can change without changing business logic.

## Migration Plan

1. Record ADR-0011 as the authoritative deployment decision and align ADR-0007 and ADR-0009 while retaining the accepted RabbitMQ, Redis and Kubernetes-deferral boundaries.
2. Update the architecture overview, deployment guide and oRPC guide to use the Vercel/Railway topology and product-scoped origins.
3. Update ADR cross-references and status text so no active decision still requires Cloudflare Worker/Containers or Cloudflare Cron for this product.
4. Validate all documentation links, domain references and OpenSpec artifacts. This completes the current documentation-only change.
5. In later OpenSpec changes, implement local RabbitMQ/Redis dependencies, separate API/Consumer/Cron entrypoints, CORS, readiness, durable job records, Railway configuration and provider provisioning.
6. Provision and verify platform-generated domains before adding the Cloudflare DNS-only CNAME/TXT records. No live-origin rollback is needed until resources exist; before cutover, rollback is reverting the documentation decision through a superseding ADR.
