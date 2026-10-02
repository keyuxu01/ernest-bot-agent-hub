# ADR-0011: Use Vercel Web with Railway Backend Workloads

- Status: Accepted
- Date: 2026-10-02
- Amends: ADR-0007 Consumer hosting selection and ADR-0009 application compute placement

## Context

The product needs a Next.js frontend, a normal Node.js runtime for NestJS APIs, a continuously running
RabbitMQ Consumer and periodic command publication. The API, Consumer and scheduled publishers need explicit,
independently deployable lifecycles on a container platform.

The repository is also expected to grow beyond one product. Assigning the current product the apex
`ernestbot.com` origin and the generic `api.ernestbot.com` hostname would make later products depend on a
renaming or a shared gateway decision that does not yet exist.

## Decision

- Keep Cloudflare as the authoritative DNS provider for `ernestbot.com`; DNS ownership does not determine the
  application hosting provider.
- Deploy `agentic-rag-client` to Vercel and expose it at `know-research.ernestbot.com`.
- Deploy the NestJS business API to Railway and expose it at `know-research-api.ernestbot.com`.
- Use DNS-only records for the initial Vercel and Railway custom domains. Adding Cloudflare proxying, WAF or
  edge routing later requires an explicit decision that owns TLS and request-policy behavior.
- Deploy the RabbitMQ Consumer as a separate, supervised Railway service with Serverless/app sleeping disabled.
  It must not share lifecycle or replica count with the HTTP API.
- Use short-lived Railway Cron services as the default production schedule owner. A Cron process publishes one
  versioned, idempotent RabbitMQ command with publisher confirmation, closes its resources and exits; it does
  not run the long-lived business operation.
- Do not use `@Cron()` in ordinary API replicas for production-critical schedules. A dedicated NestJS Scheduler
  remains possible only through a later ADR that addresses singleton/leader election, persistent occurrences,
  compensation and recovery.
- Keep RabbitMQ, Redis, the system-of-record database, object storage and vector storage outside the filesystem
  and lifecycle of Railway application containers. Production state services must have an explicit owner for
  persistence, backup and recovery; a catalog template is not assumed to be managed automatically.
- Build Railway services from the monorepo root with workspace-scoped Turbo build and start commands. Watch
  Paths include the target application, shared dependencies such as `packages/contracts`, and relevant root
  workspace/build files.
- Treat Railpack layer caching as an optimization whose hit rate is not guaranteed. Railway builds may use
  Vercel Remote Cache through scoped build credentials; build-time public variables must contribute to Turbo
  task hashes before remote caching is enabled.

## Runtime Topology

```text
Cloudflare authoritative DNS
  |
  +-- know-research.ernestbot.com --------> Vercel Next.js Web
  |
  +-- know-research-api.ernestbot.com ----> Railway NestJS API
                                                  |
                                           publisher confirm
                                                  v
                                       Managed durable RabbitMQ
                                                  |
                                             manual ack
                                                  v
                                       Railway NestJS Consumer
                                       always-on / supervised

Railway Cron publisher -- versioned idempotent command --> RabbitMQ

Railway API / Consumer
  +-- Managed Redis: cache and short-lived coordination
  +-- Database: business facts, job state and idempotency
  +-- Object storage: source documents and large objects
  `-- Vector storage: embeddings and indexes
```

## Turborepo Deployment Boundary

`agentic-rag-business-service` depends on workspace packages, so Railway uses the repository root rather than
an application subdirectory as its build root. The initial API commands are:

```text
Build: pnpm turbo run build --filter=agentic-rag-business-service
Start: pnpm --filter agentic-rag-business-service start:prod
```

Consumer and Cron publisher services use the same filtered build and later receive dedicated start scripts.
Their Watch Paths must include at least the application directory, `packages/contracts`, relevant shared
TypeScript configuration, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `turbo.json`.

`NEXT_PUBLIC_API_BASE_URL` is embedded into browser artifacts and therefore participates in the frontend build
hash. Runtime-only values such as Railway's `PORT` may pass through without changing the build hash. A future
Docker packaging change may use `turbo prune --docker`; this ADR does not require a Dockerfile.

## Consequences

- Vercel remains responsible for the Next.js delivery path while Railway owns all NestJS process types.
- The API, Consumer and Cron publisher can deploy and scale independently even though they share source code.
- The product does not reserve generic domain names needed by future applications.
- The NestJS/Railway boundary owns exact CORS enforcement for the public API.
- Railway is a shared failure domain for application compute and Cron startup; RabbitMQ durability, restart
  policies, monitoring and compensation scans provide recovery rather than assuming the scheduler is infallible.
- Railway Cron runs in UTC, may start later than the exact minute and skips a new occurrence while the previous
  process remains active. Cron publishers must therefore be short-lived and schedules needing stronger
  guarantees require a separate decision.
- Managed RabbitMQ, Redis and database services add cost, but keep persistence, failover, backup and upgrade
  responsibilities outside stateless application containers.
- Railway Watch Paths are explicit path rules rather than a complete Turbo dependency analysis and must be kept
  aligned with workspace dependencies.

## Alternatives

- Railway for Web as well as backend workloads: deferred because Vercel currently provides the preferred
  Next.js and Turborepo frontend deployment experience.
- A single Railway API process with RabbitMQ consumers and NestJS `@Cron()`: rejected because API scaling and
  deployments would change consumer concurrency and schedule cardinality together.
- Kubernetes: still deferred under ADR-0009 until the documented scale and operational triggers are met.

## References

- [Railway monorepo deployment](https://docs.railway.com/deployments/monorepo)
- [Railway Cron Jobs](https://docs.railway.com/cron-jobs)
- [Railway private networking](https://docs.railway.com/networking/private-networking)
- [Vercel Remote Cache](https://vercel.com/docs/monorepos/remote-caching)
