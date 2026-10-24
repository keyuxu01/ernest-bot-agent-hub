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
      | PostgreSQL       |
      | MongoDB          |
      | Elasticsearch    |
      | Neo4j graph      |
      | RustFS objects   |
      +------------------+

Shared foundations:
  @repo/contracts  Zod runtime schemas and inferred types
  @repo/ui         reusable React presentation components
```

The Assistant is a parallel product boundary with three deployables: `user-platform-service` authenticates
the Assistant allowlist, `assistant-runtime-service` owns durable Agent execution, and `assistant-cli` is the
Ink client and local workspace capability host. See [ADR-0018](./decisions/0018-separate-user-platform-assistant-runtime-and-cli.md),
[ADR-0019](./decisions/0019-use-postgresql-runtime-truth-redis-coordination-and-mem0-facts.md), and
[ADR-0020](./decisions/0020-use-deep-agents-local-tool-gateway-and-ink.md).
The illustrated walkthrough is
[Node Assistant Runtime knowledge sharing](./proposals/2026-10-05-node-agent-runtime-knowledge-sharing.md).
The CLI reaches UserPlatform and AssistantRuntime through loopback HTTP/HTTP+SSE in local development and
HTTPS/HTTPS+SSE outside localhost. Runtime verifies UserPlatform's
five-minute asymmetric token locally; disabling a user blocks new issuance/refresh immediately and existing
tokens/streams end by expiry. The two services do not use Nest TCP, a revocation bus, or per-request introspection.
The repository-owned MCP collection uses `http://localhost:9021` in development/test. User-configured remote
MCP is restricted to public HTTPS with connection-time SSRF checks; server and workstation stdio MCP
are unsupported. Local workspace tools instead use a binding-specific authenticated SSE downlink and HTTPS
ack/result uplink to the exact CLI. The CLI enforces workspace confinement and local approvals.
User-owned model base URLs use the same initial, redirect and actual-connect public-network revalidation before
any API key or model request is transmitted.
The concrete PostgreSQL, Redis and Mem0 configuration is documented in the
[Assistant Runtime environment guide](../guides/assistant-runtime-environment.md).
Phase 1 consumes managed Mem0 Platform through the Runtime adapter; Mem0 OSS is neither vendored into this
monorepo nor added as a Git submodule, and self-hosting is deferred to a separate architecture/OpenSpec decision.
PostgreSQL owns durable conversation/execution truth, Redis owns reconstructable hot coordination, Mem0 stores
only filtered semantic facts, and object storage owns artifacts. Fork creates an independent PostgreSQL Session;
Revert and Revert-and-edit preserve audit history. Deep Agents child Runs are the only SubAgent model, while
Suggested Sessions and LangGraph Studio are explicit exclusions. Users provide their own model connection and
free-form model name; optional reasoning effort and service tier are snapshotted on each Run.

PostgreSQL is the system of record for structured knowledge metadata and MongoDB stores document bodies.
Published documents are chunked and embedded with 通义千问, then written to Elasticsearch `kh_chunk`.
See [ADR-0013](./decisions/0013-use-postgresql-and-mongodb-for-documents.md) and
[ADR-0016](./decisions/0016-use-elasticsearch-for-rag-chunks.md).

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
Redis provides cache, distributed coordination and short-lived state (including Agent session working sets with TTL); it does not replace RabbitMQ or the
system-of-record database. Application containers do not own durable state.

This is the selected target topology, not the current provisioning state. Cloudflare already manages the
`ernestbot.com` DNS zone, but the Vercel and Railway projects, production services and product-scoped DNS
records are not yet provisioned. No Web or API routing record should be inferred from the diagram; see the
[deployment and infrastructure guide](../guides/deployment-and-infrastructure.md) for the rollout order.
Cloudflare DNS will point `know-research.ernestbot.com` to the future Vercel project and
`know-research-api.ernestbot.com` to the future Railway API without transferring the domain.

Phase 1 deliberately does not introduce Kubernetes. Local infrastructure uses a Compose-compatible stack
executed with Podman Compose in local development;
production RabbitMQ and Redis will use durable managed services. Kubernetes remains an evolution option
when service count, consumer scaling or an established platform team justifies its operational cost. See
the [deployment and infrastructure guide](../guides/deployment-and-infrastructure.md).

## State Ownership

| State or workload               | Owner                     | Must survive a NestJS restart |
| ------------------------------- | ------------------------- | ----------------------------- |
| Business facts and job records  | Database                  | Yes                           |
| Original documents              | Object storage such as R2 | Yes                           |
| Embeddings and vector indexes   | Elasticsearch `kh_chunk`  | Yes                           |
| Knowledge graph (rebuildable)   | Neo4j                     | Yes                           |
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
| `agentic-rag-business-service` | Knowledge-base domain and business APIs  |       `9020` |
| `mcp-app-collections`          | MCP Tools, Resources and MCP App widgets |       `9021` |
| `user-platform-service`        | Assistant OAuth, allowlist and grants    |          TBD |
| `assistant-runtime-service`    | Durable Assistant execution and SSE      |       `9030` |
| `assistant-cli`                | Ink UI and local workspace capability    |          N/A |

## Protocol Boundaries

| Boundary                           | Protocol                                             | Status        |
| ---------------------------------- | ---------------------------------------------------- | ------------- |
| Interactive agent output to Web UI | Vercel AI SDK UI stream / compatible AG-UI transport | Accepted      |
| Agent to tools and resources       | MCP                                                  | Accepted      |
| Web to business service            | HTTP with Zod contracts; stable oRPC v1 PoC          | Current / PoC |
| Browser business server state      | oRPC query options with TanStack Query v5            | Accepted      |
| Third-party HTTP documentation     | Generated OpenAPI at `/openapi.json` for the PoC     | PoC           |
| Assistant CLI product events       | Local HTTP; deployed HTTPS commands + Session SSE    | Accepted      |
| Assistant local tool dispatch      | Binding-specific SSE + local HTTP/deployed HTTPS     | Accepted      |
| Assistant remote MCP               | Public-network HTTPS MCP only                        | Accepted      |

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
packages/contracts ------> Zod + contract-only oRPC runtime; never apps/* or packages/ui
protocol adapters -------> business services / use cases
business services -------> data-access abstractions
```

Runtime data is validated once when it crosses an external trust boundary. Validated values may flow
through internal layers without redundant parsing until they cross another boundary.

## Backend Module and Compilation Boundary

Both NestJS applications are CommonJS deployment units and use TypeScript `NodeNext` module semantics. Their
package manifests intentionally omit `"type": "module"`, so ordinary `.ts` files emit CommonJS while
`NodeNext` continues to model modern package exports and Node.js interoperability. Backend source and tests
use extensionless relative imports. Production executes the compiled `dist` JavaScript directly on Node.js
24 or newer.

The Node.js 24 runtime floor is part of this boundary: oRPC publishes ESM-only packages, and Node.js 22+
supports loading compatible ESM modules synchronously from CommonJS. The repository verifies the exact oRPC
entry points used by the business service rather than converting every NestJS source file to native ESM.

`@repo/contracts` is a compiled internal package. Turbo builds it before consuming applications; its
`require` and `import` export conditions both resolve to CommonJS artifacts in `dist`, while `types` resolves
to emitted declarations. Runtime conditions never fall back to workspace TypeScript source. The private
NestJS applications disable declaration output because they are deployment units, not package-consumption
boundaries. This does not change MCP Widget or Next.js bundling. See
[ADR-0012](./decisions/0012-use-commonjs-nestjs.md).

The business service uses feature-first source layout. Business and operational capabilities live under
`src/modules/<feature>`; each module owns its controllers, services, DTOs, persistence models and local tests.
Technical integrations that construct shared connections live under `src/infrastructure/<capability>`.
`AppModule` is the composition root and does not directly register feature controllers or services. Imports
point to concrete files instead of a `modules/index.ts` barrel so dependency direction remains visible.

## Document Persistence Boundary

The business service uses one root TypeORM connection for PostgreSQL and one root Mongoose connection for
MongoDB. `DatabaseModule` owns connection construction and validated environment configuration; feature
modules own their persistence models. `DocumentModule` therefore registers `DocumentEntity` through
`TypeOrmModule.forFeature` and `DocumentContent` through `MongooseModule.forFeature`, while the root TypeORM
configuration discovers feature-owned entities through `autoLoadEntities`.

PostgreSQL `kh_document` owns queryable metadata, lifecycle state and the Snowflake document ID. MongoDB
`document_content` owns Markdown content, previews and content versions. `kh_document.content_id` references
the MongoDB ObjectId as a string, and MongoDB `documentId` references the PostgreSQL Snowflake ID. This is an
application-enforced relationship rather than a cross-database foreign key or ACID transaction. Write flows
must define compensation or retry behavior for partial failure. See
[ADR-0013](./decisions/0013-use-postgresql-and-mongodb-for-documents.md).

## Document Parsing Boundary

`POST /documents/upload/parse` accepts one PDF, DOCX, XLSX, PPTX, TXT or Markdown file up to 50 MB.
TXT and Markdown are read as UTF-8; the other formats are converted in-process (`pdf-parse`, `mammoth`

- `turndown`, `exceljs`, OOXML for PPTX, `officeparser` as fallback). Extracted images are stored in
  RustFS and their Markdown links rewritten, then the draft is persisted through the existing MongoDB
  content and PostgreSQL metadata flow without changing either record shape. The link between a document
  and its RustFS source file is returned to the client but not yet persisted.

Conversion stays inside `DocumentModule`. The MVP waits inside the request and keeps no parse-task
state, so an interrupted request must be re-uploaded. See
[ADR-0015](./decisions/0015-use-in-process-document-parsers.md).

## Document Publish and RAG Index Boundary

`PUT /documents/:id/publish` writes `Published` in PostgreSQL, then publishes
`RagBusinessReindexMessageV1` to RabbitMQ. The message carries only document IDs. A consumer in
`PipelineModule` loads metadata and Mongo bodies through document repositories, splits Markdown,
embeds via `EmbeddingService` in `src/infrastructure/embedding` (Qwen / DashScope compatible-mode),
and upserts Elasticsearch `kh_chunk`. Queue publish failure does not roll back the published status.
RabbitMQ and Elasticsearch are required at startup; a down broker or cluster fails boot. See [ADR-0016](./decisions/0016-use-elasticsearch-for-rag-chunks.md),
[ADR-0017](./decisions/0017-place-qwen-embedding-in-infrastructure.md) and the
[RabbitMQ guide](../guides/rabbitmq.md). The HTTP process currently
also runs the consumer; splitting that onto the Railway Consumer service in ADR-0007 is
follow-up work.

## Knowledge Graph Build Boundary

Publish and soft delete also send `RagBusinessKgBuildMessageV1` (document IDs only) to the dedicated
`kg.graph.exchange` / `kh.kg.graph.queue`, so slow LLM extraction never blocks RAG or Search. The
`PipelineModule` consumer reuses the RAG chunker (same `chunkId` as `kh_chunk`), extracts entities and
relations per chunk with the Qwen chat model from `src/infrastructure/chat-model`, and writes
`KnowledgeDocument` / `DocumentChunk` / `KnowledgeEntity` nodes through `GraphStoreService` in
`src/infrastructure/neo4j`. Each build deletes the document's previous graph first. Neo4j is required at
startup like RabbitMQ and Elasticsearch. Delivery has the same no-outbox / no-DLQ limits as RAG, and there
is no graph query API yet. See [ADR-0022](./decisions/0022-use-neo4j-for-knowledge-graph.md).

## Architecture Decision Records

| ADR                                                                      | Decision                                            | Status     |
| ------------------------------------------------------------------------ | --------------------------------------------------- | ---------- |
| [ADR-0001](./decisions/0001-use-zod-contracts.md)                        | Zod-based shared runtime contracts                  | Accepted   |
| [ADR-0002](./decisions/0002-use-shadcn-tailwind.md)                      | shadcn/ui and Tailwind CSS for frontend UI          | Accepted   |
| [ADR-0003](./decisions/0003-separate-ai-stream-rpc-and-mcp.md)           | Separate AI stream, business API and MCP boundaries | Accepted   |
| [ADR-0004](./decisions/0004-evaluate-orpc.md)                            | Evaluate oRPC for Web-to-service APIs               | Proposed   |
| [ADR-0005](./decisions/0005-evaluate-mcp-nest.md)                        | Evaluate `@rekog/mcp-nest` v2 for the MCP service   | Proposed   |
| [ADR-0007](./decisions/0007-use-rabbitmq.md)                             | RabbitMQ for asynchronous messaging                 | Accepted   |
| [ADR-0008](./decisions/0008-use-redis.md)                                | Redis for cache and distributed coordination        | Accepted   |
| [ADR-0009](./decisions/0009-defer-kubernetes.md)                         | Defer Kubernetes during phase 1                     | Accepted   |
| [ADR-0010](./decisions/0010-use-tanstack-query.md)                       | TanStack Query for browser server state             | Accepted   |
| [ADR-0011](./decisions/0011-use-vercel-and-railway.md)                   | Use Vercel Web with Railway Backend Workloads       | Accepted   |
| [ADR-0012](./decisions/0012-use-commonjs-nestjs.md)                      | CommonJS NestJS applications with NodeNext          | Accepted   |
| [ADR-0013](./decisions/0013-use-postgresql-and-mongodb-for-documents.md) | PostgreSQL metadata with MongoDB document content   | Accepted   |
| [ADR-0014](./decisions/0014-use-mineru-cloud-for-document-parsing.md)    | MinerU cloud API for upload document parsing        | Superseded |
| [ADR-0015](./decisions/0015-use-in-process-document-parsers.md)          | In-process parsers for upload document parsing      | Accepted   |
| [ADR-0016](./decisions/0016-use-elasticsearch-for-rag-chunks.md)         | Elasticsearch + Qwen embeddings for RAG chunks      | Accepted   |
| [ADR-0017](./decisions/0017-place-qwen-embedding-in-infrastructure.md)   | Qwen embedding client in `src/infrastructure`       | Accepted   |

| [ADR-0021](./decisions/0021-document-search-index.md) | Separate document Search snapshots from RAG chunks | Accepted |
| [ADR-0022](./decisions/0022-use-neo4j-for-knowledge-graph.md) | Neo4j knowledge graph built from published documents | Accepted |

ADR status values are `Proposed`, `Accepted`, `Rejected`, `Superseded` and `Deprecated`. Accepted ADRs
are not edited to reverse a decision; a new ADR supersedes the old one.

## Active Implementation Proposals

The following documents retain detailed design and capability acceptance material while accepted ADRs own the
long-lived architecture decisions:

- [Assistant Runtime + local console Node capability plan](./proposals/2026-10-05-node-agent-runtime-plan.md) —
  defines the active OpenSpec Apply scope for a product-scoped Assistant runtime, durable PostgreSQL execution
  model, Redis working set, Mem0 long-term memory, replayable SSE and a local CLI tool gateway. ADR-0018 through
  ADR-0020 own the accepted architecture boundaries; the capability ledger owns implementation evidence.

## Maintenance

Update this overview and add or supersede an ADR whenever a change introduces or replaces a framework,
protocol, database, deployment model, cross-application dependency or trust boundary. Use OpenSpec for
the concrete proposal and implementation plan, and link the relevant ADR from that change when applicable.
