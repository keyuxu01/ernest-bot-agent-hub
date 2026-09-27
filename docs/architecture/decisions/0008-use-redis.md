# ADR-0008: Use Redis for Cache and Distributed Coordination

- Status: Accepted
- Date: 2026-09-28

## Context

Multiple NestJS replicas and background consumers need shared caching and coordination that cannot live in
process memory. RabbitMQ already owns durable asynchronous commands and events, while the database owns
business facts and durable job state. Redis needs a narrow responsibility that does not duplicate either
system.

## Decision

- Add Redis as shared infrastructure for cache, distributed locks, rate-limit counters, short-lived session
  data, token deny lists and cross-replica Pub/Sub when required.
- Keep business facts, durable job status and idempotency records in the database rather than relying only on
  Redis.
- Keep RabbitMQ as the primary task and event transport; do not introduce BullMQ as a second job system.
- Require namespaced keys, explicit TTLs and documented invalidation rules for cached data.
- Treat distributed locks as leases with bounded expiry; handlers must still be idempotent because a lock
  alone cannot guarantee exactly-once execution.
- Run Redis through Docker Compose in local development and use a durable managed Redis service in phase-1
  production.
- Access Redis through application-owned ports/adapters so the business layer does not depend directly on a
  vendor SDK.

## Consequences

- NestJS replicas can share cache and coordination without retaining process-local authority.
- Redis failure may reduce performance or temporarily disable coordination features, but must not erase the
  system of record.
- Cache stampede protection, TTL selection, eviction policy and metrics become operational concerns.
- Production requires TLS, authentication, least-privilege credentials and a documented persistence/HA
  policy appropriate to each Redis use case.

## Alternatives

- In-process cache: simple, but replicas diverge and replacement loses all entries.
- Database-backed locks and cache: fewer services, but creates avoidable database contention for hot,
  short-lived coordination.
- BullMQ: rejected because RabbitMQ is already the accepted task broker.

## References

- [Redis products and operating models](https://redis.io/docs/latest/operate/)
- [Redis Enterprise for Kubernetes](https://redis.io/docs/latest/operate/kubernetes/)
