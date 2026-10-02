# ADR-0007: Use RabbitMQ for Asynchronous Messaging

- Status: Accepted
- Date: 2026-09-27
- Amended by: ADR-0011, which selects Railway for the continuously running Consumer

## Context

Knowledge ingestion requires durable asynchronous commands, explicit acknowledgement, backpressure,
dead-letter routing and independently scalable consumers. RabbitMQ is a project requirement and must remain
the primary message broker.

Stateless application containers are replaceable, while a production RabbitMQ broker requires stable durable
storage. API replicas also scale and deploy independently from long-lived consumers. Broker, API and Consumer
lifecycles therefore need separate deployment responsibilities.

## Decision

- Use RabbitMQ as the primary asynchronous command and event transport.
- Run production RabbitMQ on managed, durable infrastructure outside application-service filesystems.
- Run HTTP/oRPC producers in the Railway NestJS API service and consumers in a separate, continuously running
  Railway NestJS Consumer service.
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

ADR-0011 selects short-lived Railway Cron publishers as the default periodic trigger. Any later external
scheduler still publishes commands into RabbitMQ; the system does not add a parallel primary broker.

## Runtime Topology

```text
Vercel Web
    |
Railway NestJS API -- publisher confirm --+
                                           |
Railway Cron publisher -- publisher confirm+--> Managed RabbitMQ
                                                     |
                                                     v
                                          Railway NestJS Consumer
                                          always-on / supervised
                                                     |
                                          manual ack after durable result
```

## Consequences

- Production gains RabbitMQ routing, acknowledgements, prefetch, retry and dead-letter capabilities.
- The deployment adds a stateful managed service outside the stateless application-process lifecycle.
- Consumer instances cannot scale to zero while they are responsible for active RabbitMQ subscriptions.
- Health probes detect failure but do not provide recovery by themselves; the watchdog owns recovery, while
  RabbitMQ retains unacknowledged or queued work during Consumer downtime.
- AMQP connections must reconnect after Consumer restarts and deployments.
- Broker region selection must minimize latency to the NestJS Consumer runtime.
- Workflow orchestration, if introduced later, is not a replacement message broker.

## Alternatives

- Another queue product: rejected because RabbitMQ is the selected primary broker and two brokers would split
  delivery, retry and operational semantics.
- RabbitMQ inside an application service: rejected because application filesystems and service lifecycles are
  unsuitable for durable stateful infrastructure.
- RabbitMQ consumers inside API services: rejected because API replicas can restart or scale independently,
  causing unpredictable consumer count and duplicate workload pressure.

## References

- [RabbitMQ production checklist](https://www.rabbitmq.com/docs/production-checklist)
- [RabbitMQ quorum queues](https://www.rabbitmq.com/docs/quorum-queues)
- [Consumer acknowledgements and publisher confirms](https://www.rabbitmq.com/docs/confirms)
- [RabbitMQ Kubernetes Operators](https://www.rabbitmq.com/kubernetes/operator/operator-overview)
