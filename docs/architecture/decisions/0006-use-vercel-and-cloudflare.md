# ADR-0006: Use Vercel Web with Cloudflare Runtime Services

- Status: Accepted
- Date: 2026-09-27

## Context

The system needs a Next.js frontend, a full NestJS runtime for oRPC and MCP, and reliable scheduled or
long-running knowledge-base ingestion work. Deploying NestJS directly as a Worker would constrain the
application to the Worker runtime, while relying on an in-process NestJS cron inside a Container would make
the schedule depend on a Container instance remaining alive and singular.

## Decision

- Deploy the Next.js Web application to Vercel.
- Keep Cloudflare as the authoritative DNS provider; the domain does not need to be transferred to Vercel.
- Use `ernestbot.com` as the production Web origin and expose `api.ernestbot.com` through a thin
  Cloudflare Worker.
- Run the request-driven NestJS business API and MCP processes in Cloudflare Containers behind that Worker.
- Let Cron Triggers or scheduled Workflows own schedules, publish durable commands through RabbitMQ, and
  reserve Workflows for durable orchestration when it is actually required.
- Keep job business logic in NestJS use cases and make every externally retried job idempotent.
- Call `api.ernestbot.com` directly from the browser instead of adding a Vercel same-origin API proxy.
- Configure the future Vercel Web DNS record from the values shown by the Vercel project and initially keep
  that record DNS-only in Cloudflare; bind `api.ernestbot.com` directly to the Cloudflare Worker.

The message-broker portion of this decision is superseded by ADR-0007: RabbitMQ is the primary asynchronous
message transport. Cloudflare schedules may still initiate jobs, and Workflows remain available for durable
orchestration, but Cloudflare Queues is not part of the core messaging path.

## CORS and Trust Boundary

`ernestbot.com` and `api.ernestbot.com` are different origins even though they share a registrable domain.
The public Worker owns preflight handling and an exact Web-origin allowlist. It must never combine a wildcard
origin with credentialed requests. The NestJS Container is reachable through its Worker binding and is not
published as an additional browser-facing origin.

Production and preview origins must be configured explicitly. Local development may allow
`http://localhost:3000` or run through the local Worker entrypoint, but development origins must not leak
into the production allowlist.

## Operational Status

This ADR records the accepted target architecture, not completed provisioning. As of 2026-09-28,
`ernestbot.com` is managed in Cloudflare DNS, but Vercel has not been opened and no Vercel project exists.
The Worker, Container and `api.ernestbot.com` custom domain are also not deployed. DNS records for Vercel
must only be created after the future Vercel project reports its exact domain requirements.

The RabbitMQ Consumer hosting platform is intentionally unresolved. This ADR does not select Cloudflare
Containers, GCP Cloud Run Worker Pools or another always-on platform for the Consumer; it only governs the
request-driven API/MCP runtime and Cloudflare ingress.

## Consequences

- NestJS retains a normal Node.js and Docker runtime, including its existing oRPC and MCP integrations.
- Worker code remains small and limited to ingress policy, routing and triggers.
- Container cold starts and ephemeral local disks remain platform constraints; durable data belongs in
  external databases, object storage or vector stores.
- Cross-origin browser requests require explicit CORS tests and a public client-side API base URL.
- Jobs require idempotency because retries and queue delivery can execute work more than once.
- RabbitMQ retains commands while a Consumer is unavailable, but queue depth does not start a stopped
  Cloudflare Container. Critical Consumers therefore require a supervised, non-scale-to-zero runtime or an
  explicit start-and-watchdog mechanism.
- Long-running Consumers expose separate liveness, readiness and instance-identity probes. A watchdog owns
  restart and alerting; successful probe responses alone are not treated as proof that the recovery path works.

## Alternatives

- Run NestJS directly on Workers: fewer runtime components, but higher compatibility risk for the full
  NestJS and Node.js dependency graph.
- Proxy the API through Vercel: removes browser CORS configuration, but adds a hop and couples backend
  traffic to the frontend deployment.
- Use NestJS `@Cron()` inside an ordinary API deployment: simple locally, but rejected for critical
  production schedules. A sleeping or restarting instance misses triggers without replay, while multiple
  replicas trigger duplicates. A Redis lock may reduce duplicates but cannot recreate a trigger that never
  occurred. NestJS remains the owner of the use case; only the scheduling clock moves outside the API process.
