# ADR-0009: Defer Kubernetes During Phase 1

- Status: Accepted
- Date: 2026-09-28
- Related: ADR-0011 selects Railway for application compute

## Context

The phase-1 system contains two NestJS services and will add background consumers, RabbitMQ and Redis.
Kubernetes would provide mature rollout, self-healing, service discovery and workload scaling, but it would
also add cluster, ingress, storage, backup, monitoring, security and upgrade responsibilities. Running
RabbitMQ or Redis on Kubernetes does not make those stateful systems managed services.

Railway provides sufficient deployment, restart, networking and service isolation capabilities for the
current workload without requiring the team to operate a Kubernetes control plane.

## Decision

- Do not introduce a production Kubernetes cluster during phase 1.
- Use Docker Compose for local RabbitMQ and Redis dependencies.
- Use managed RabbitMQ and managed Redis in production rather than self-hosting stateful clusters.
- Run stateless NestJS API/MCP processes as Railway services.
- Run RabbitMQ consumers as separate continuously available Railway services; do not mix consumer
  lifecycle with request-serving API replicas.
- Keep deployment manifests, configuration and application boundaries portable so NestJS workloads can move
  to Kubernetes later without moving business logic.

Kubernetes adoption requires a separate ADR and OpenSpec change. Re-evaluate it when several of these
conditions are true:

- an established platform/SRE team already operates Kubernetes;
- multiple independently deployed backend services or consumer types exist;
- queue-depth-driven autoscaling is required;
- rolling/canary delivery, namespace isolation or private networking is a concrete requirement;
- managed-service or Railway limitations create measured cost, reliability or scaling problems.

## Stateless NestJS Constraint

A NestJS replica may hold connections and in-flight work, but no durable system fact. It must not rely on
local files, process-local sessions, in-memory locks, authoritative caches, local job lists or one replica's
cron state. State ownership is external:

- database for business facts, job state and idempotency;
- RabbitMQ for unacknowledged commands and events;
- Redis for cache and distributed coordination;
- object storage for documents;
- vector storage for embeddings and indexes.

Consumers acknowledge messages only after their durable side effects complete. A terminated consumer can
therefore be replaced and RabbitMQ can redeliver unacknowledged work.

## Consequences

- Phase 1 avoids premature cluster operations and keeps the platform smaller.
- Managed RabbitMQ and Redis add vendor cost but transfer persistence, failover, backup and upgrade duties.
- Railway Consumer scaling and queue backlog must be monitored explicitly.
- A future Kubernetes migration would place NestJS APIs and workers in Deployments behind an Ingress or
  Gateway; managed RabbitMQ and Redis can remain external during that migration.

## Alternatives

- Kubernetes for every workload now: powerful, but disproportionate to the current service count and
  operations capacity.
- Railway compute with RabbitMQ and Redis on a separate Kubernetes cluster: rejected because it combines two
  compute control planes and adds unnecessary cross-platform networking.
- Kubernetes for stateless NestJS while retaining managed RabbitMQ and Redis: a valid future migration path
  when workload scaling justifies it.

## References

- [Kubernetes capabilities and boundaries](https://kubernetes.io/docs/concepts/overview/)
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
