# ADR-0007: Use RabbitMQ for Asynchronous Messaging

- Status: Accepted
- Date: 2026-09-27
- Supersedes: the Cloudflare Queues portion of ADR-0006

## Context

Knowledge ingestion requires durable asynchronous commands, explicit acknowledgement, backpressure,
dead-letter routing and independently scalable consumers. RabbitMQ is a project requirement and must remain
the primary message broker rather than being replaced by Cloudflare Queues.

Cloudflare Container disks are ephemeral, while a production RabbitMQ broker requires stable durable
storage. A sleeping API Container also cannot maintain a long-lived consumer connection. Broker and consumer
lifecycle therefore need separate deployment responsibilities.

## Decision

- Use RabbitMQ as the primary asynchronous command and event transport.
- Run production RabbitMQ on external managed, durable infrastructure; do not run the broker in a
  Cloudflare Container.
- Run HTTP/oRPC producers in the NestJS API Container and consumers in a separate, continuously running
  NestJS Consumer deployment. The Consumer hosting platform is pending a later decision.
- Keep the Consumer runtime supervised and non-scale-to-zero. Its platform health system or an external
  watchdog checks `/health/whoami` for instance identity and uptime plus `/health/ready` for RabbitMQ
  connection and consumer registration; repeated failures trigger an explicit restart and an alert.
- Use durable quorum queues for critical jobs, persistent messages, publisher confirms and manual consumer
  acknowledgements.
- Configure retry exchanges/queues and dead-letter exchanges instead of immediately requeueing poison
  messages.
- Treat delivery as at least once and require an event ID plus an idempotency key at every consumer boundary.
- Store message envelopes as versioned Zod schemas in `@repo/contracts`; messages contain identifiers and
  object-storage references, not document payloads.
- Use a transactional outbox whenever a database change and message publication must succeed as one logical
  operation.
- Do not introduce BullMQ or Redis-backed jobs alongside RabbitMQ; RabbitMQ remains the single primary task
  and event transport.

Cloudflare Cron Triggers or scheduled Workflows may initiate periodic work, but they publish commands into
RabbitMQ. Cloudflare Queues is not used as a parallel primary broker.

## Runtime Topology

```text
Vercel Web
    |
Cloudflare Worker ingress / scheduled trigger
    |
NestJS API Container -- publisher confirm --> Managed RabbitMQ
                                                 |
                                                 v
                                  Always-on NestJS Consumer Runtime
                                  hosting provider: pending
                                                 |
                                      manual ack after durable result
```

## Consequences

- Production gains RabbitMQ routing, acknowledgements, prefetch, retry and dead-letter capabilities.
- The deployment adds a stateful managed service outside Vercel and Cloudflare.
- Consumer instances cannot scale to zero while they are responsible for active RabbitMQ subscriptions.
- Health probes detect failure but do not provide recovery by themselves; the watchdog owns recovery, while
  RabbitMQ retains unacknowledged or queued work during Consumer downtime.
- AMQP connections must reconnect after Consumer restarts and deployments.
- Broker region selection must minimize latency to the NestJS Consumer runtime.
- Cloudflare Workflows are optional orchestration infrastructure, not a replacement message broker.

## Alternatives

- Cloudflare Queues: operationally simpler inside Cloudflare, but does not meet the RabbitMQ requirement.
- RabbitMQ inside Cloudflare Containers: rejected because broker storage would be ephemeral and Container
  lifecycle is unsuitable for durable stateful infrastructure.
- RabbitMQ consumers inside API Containers: rejected because API replicas can sleep or scale independently,
  causing unpredictable consumer count and duplicate workload pressure.

## References

- [RabbitMQ production checklist](https://www.rabbitmq.com/docs/production-checklist)
- [RabbitMQ quorum queues](https://www.rabbitmq.com/docs/quorum-queues)
- [Consumer acknowledgements and publisher confirms](https://www.rabbitmq.com/docs/confirms)
- [RabbitMQ Kubernetes Operators](https://www.rabbitmq.com/kubernetes/operator/operator-overview)
