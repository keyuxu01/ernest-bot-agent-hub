# Architecture and Technology Decisions

本文档描述仓库当前架构事实。单项技术选择的背景、备选方案和后果记录在
[`decisions/`](./decisions/) 下的 Architecture Decision Records（ADR）中。

## System Context

```text
+-----------------------+       +-------------------------------+
| Next.js Web           |       | Agent / Chat Host             |
| agentic-rag-client    |       | AI SDK UI / ChatGPT / other   |
+-----------+-----------+       +---------------+---------------+
            |                                   |
            | HTTP or evaluated RPC             | MCP
            v                                   v
+---------------------------+       +---------------------------+
| NestJS Business Service   |       | MCP App Collections       |
| domain and use cases      |<------| protocol adapter + widget |
+-------------+-------------+       +---------------------------+
              |
              v
      +------------------+
      | Knowledge Stores |
      | DB / Vector DB   |
      +------------------+

Shared foundations:
  @repo/contracts  Zod runtime schemas and inferred types
  @repo/ui         reusable React presentation components
```

The database and vector-store technologies are intentionally undecided in the first phase.

## Deployment Topology

```text
Cloudflare authoritative DNS
  |
  +-- know-research.ernestbot.com
  |       |
  |       v
  |   +------------------+
  |   | Vercel Next.js   |
  |   | Web              |
  |   +--------+---------+
  |            |
  |            | HTTPS / oRPC
  |            v
  +-- know-research-api.ernestbot.com
          |
          v
      +---------------------------+
      | Railway NestJS API        |
      | HTTP / oRPC / publishers  |
      +-------------+-------------+
                    |
             publisher confirm
                    v
      +---------------------------+
      | Managed durable RabbitMQ  |
      +-------------+-------------+
                    |
                manual ack
                    v
      +---------------------------+
      | Railway NestJS Consumer   |
      | always-on / supervised    |
      +---------------------------+

Railway Cron publisher -- versioned idempotent command --> RabbitMQ

Railway API and Consumer ----------> managed Redis
Railway API and Consumer ----------> DB / Object Storage / Vector DB
```

Browser business API calls go directly from `know-research.ernestbot.com` to
`know-research-api.ernestbot.com`; they do not use a Vercel same-origin rewrite. The Railway NestJS API owns
an exact production CORS allowlist and preflight handling. Cloudflare remains the authoritative DNS provider
but is not a required application runtime or proxy in this topology.

The API and Consumer are separate Railway services sourced from the same backend workspace. API replicas can
scale or deploy without changing Consumer count. The Consumer is supervised, never scales to zero and keeps
its RabbitMQ subscription available while idle. Railway Cron starts short-lived publisher processes that
publish versioned, idempotent commands and exit; scheduled processes never perform the long-running business
operation themselves. Ordinary API instances and Consumer instances are not the scheduler of record.

RabbitMQ uses durable managed infrastructure and remains the primary command and integration-event transport.
Redis provides cache, distributed coordination and short-lived state; it does not replace RabbitMQ or the
system-of-record database. Application containers do not own durable state.

This is the selected target topology, not the current provisioning state. Cloudflare already manages the
`ernestbot.com` DNS zone, but the Vercel and Railway projects, production services and product-scoped DNS
records are not yet provisioned. No Web or API routing record should be inferred from the diagram; see the
[deployment and infrastructure guide](../guides/deployment-and-infrastructure.md) for the rollout order.
Cloudflare DNS will point `know-research.ernestbot.com` to the future Vercel project and
`know-research-api.ernestbot.com` to the future Railway API without transferring the domain.

Phase 1 deliberately does not introduce Kubernetes. Local infrastructure will run through Docker Compose;
production RabbitMQ and Redis will use durable managed services. Kubernetes remains an evolution option
when service count, consumer scaling or an established platform team justifies its operational cost. See
the [deployment and infrastructure guide](../guides/deployment-and-infrastructure.md).

## State Ownership

| State or workload               | Owner                     | Must survive a NestJS restart |
| ------------------------------- | ------------------------- | ----------------------------- |
| Business facts and job records  | Database                  | Yes                           |
| Original documents              | Object storage such as R2 | Yes                           |
| Embeddings and vector indexes   | Vector database           | Yes                           |
| Commands and integration events | RabbitMQ                  | Yes, until acknowledged       |
| Cache, locks and rate limits    | Redis                     | Depends on the use case       |
| In-flight request data          | NestJS process memory     | No                            |

NestJS API and consumer processes remain stateless: a replica can be replaced without losing durable
system facts. Consumer connections and in-flight work are transient runtime state; manual acknowledgement
and idempotent handlers allow RabbitMQ to redeliver work after a process failure.

## Application Responsibilities

| Application                    | Responsibility                           | Default port |
| ------------------------------ | ---------------------------------------- | -----------: |
| `agentic-rag-client`           | End-user Next.js interface               |       `3000` |
| `docs`                         | Project documentation application        |       `3001` |
| `agentic-rag-business-service` | Knowledge-base domain and business APIs  |       `8080` |
| `mcp-app-collections`          | MCP Tools, Resources and MCP App widgets |       `8081` |

## Protocol Boundaries

| Boundary                           | Protocol                                             | Status        |
| ---------------------------------- | ---------------------------------------------------- | ------------- |
| Interactive agent output to Web UI | Vercel AI SDK UI stream / compatible AG-UI transport | Accepted      |
| Agent to tools and resources       | MCP                                                  | Accepted      |
| Web to business service            | HTTP with Zod contracts; stable oRPC v1 PoC          | Current / PoC |
| Browser business server state      | oRPC query options with TanStack Query v5            | Accepted      |
| Third-party HTTP documentation     | Generated OpenAPI at `/openapi.json` for the PoC     | PoC           |

AI streaming endpoints keep their native stream framing and are not wrapped in ordinary RPC responses.
MCP remains an Agent-facing protocol and does not replace standard business APIs.

TanStack Query owns browser-side business server state: loading/error lifecycle, fresh-data reuse,
invalidation, mutations and pagination. Direct oRPC calls remain valid for Server Components and imperative
work. AI streams and MCP interactions do not enter the ordinary query cache.

## Dependency Direction

```text
apps/* ------------------> packages/contracts
frontend surfaces -------> packages/ui
packages/ui -------------> React only; never apps/*
packages/contracts ------> Zod only; never apps/* or packages/ui
protocol adapters -------> business services / use cases
business services -------> data-access abstractions
```

Runtime data is validated once when it crosses an external trust boundary. Validated values may flow
through internal layers without redundant parsing until they cross another boundary.

## Architecture Decision Records

| ADR                                                            | Decision                                            | Status   |
| -------------------------------------------------------------- | --------------------------------------------------- | -------- |
| [ADR-0001](./decisions/0001-use-zod-contracts.md)              | Zod-based shared runtime contracts                  | Accepted |
| [ADR-0002](./decisions/0002-use-shadcn-tailwind.md)            | shadcn/ui and Tailwind CSS for frontend UI          | Accepted |
| [ADR-0003](./decisions/0003-separate-ai-stream-rpc-and-mcp.md) | Separate AI stream, business API and MCP boundaries | Accepted |
| [ADR-0004](./decisions/0004-evaluate-orpc.md)                  | Evaluate oRPC for Web-to-service APIs               | Proposed |
| [ADR-0005](./decisions/0005-evaluate-mcp-nest.md)              | Evaluate `@rekog/mcp-nest` v2 for the MCP service   | Proposed |
| [ADR-0007](./decisions/0007-use-rabbitmq.md)                   | RabbitMQ for asynchronous messaging                 | Accepted |
| [ADR-0008](./decisions/0008-use-redis.md)                      | Redis for cache and distributed coordination        | Accepted |
| [ADR-0009](./decisions/0009-defer-kubernetes.md)               | Defer Kubernetes during phase 1                     | Accepted |
| [ADR-0010](./decisions/0010-use-tanstack-query.md)             | TanStack Query for browser server state             | Accepted |
| [ADR-0011](./decisions/0011-use-vercel-and-railway.md)         | Use Vercel Web with Railway Backend Workloads       | Accepted |

ADR status values are `Proposed`, `Accepted`, `Rejected`, `Superseded` and `Deprecated`. Accepted ADRs
are not edited to reverse a decision; a new ADR supersedes the old one.

## Maintenance

Update this overview and add or supersede an ADR whenever a change introduces or replaces a framework,
protocol, database, deployment model, cross-application dependency or trust boundary. Use OpenSpec for
the concrete proposal and implementation plan, and link the relevant ADR from that change when applicable.
