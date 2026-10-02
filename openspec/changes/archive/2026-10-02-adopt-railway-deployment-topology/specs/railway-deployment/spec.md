## Purpose

Define the externally visible domains and deployable workload boundaries for the Know Research product so its Vercel frontend and Railway backend can evolve without occupying generic hostnames or coupling API, scheduling and queue-consumer lifecycles.

## ADDED Requirements

### Requirement: Product-scoped production domains

The deployment documentation SHALL reserve `know-research.ernestbot.com` for the Know Research frontend and `know-research-api.ernestbot.com` for its public business API. Cloudflare SHALL remain the authoritative DNS provider, and this product SHALL NOT claim the apex `ernestbot.com` origin or the generic `api.ernestbot.com` hostname.

#### Scenario: Production frontend origin is configured

- **WHEN** the Know Research frontend is provisioned for production
- **THEN** its canonical public origin is `https://know-research.ernestbot.com`
- **AND** the DNS record targets the Vercel project values reported for that domain

#### Scenario: Production API origin is configured

- **WHEN** the Know Research business API is provisioned for production
- **THEN** its canonical public origin is `https://know-research-api.ernestbot.com`
- **AND** the frontend's public API configuration and production CORS allowlist use those product-scoped origins

#### Scenario: Another product is introduced

- **WHEN** another application is added under `ernestbot.com`
- **THEN** it can receive its own product-scoped frontend and API hostnames without changing the Know Research origins

### Requirement: Vercel and Railway workload placement

The production deployment SHALL host `agentic-rag-client` on Vercel and SHALL host the NestJS business API and RabbitMQ Consumer as separate Railway services. The API and Consumer SHALL be independently deployable and SHALL NOT share a process lifecycle.

#### Scenario: API deployment is replaced or scaled

- **WHEN** the Railway API service is redeployed or its replica count changes
- **THEN** the Consumer service remains independently supervised and continues to use its own configured concurrency

#### Scenario: Consumer is idle

- **WHEN** no RabbitMQ message is available
- **THEN** the production Consumer remains eligible to receive future messages without relying on an HTTP request to wake it

#### Scenario: Railway deployment identity is inspected

- **WHEN** the business API runs with Railway replica, deployment and Git commit metadata
- **THEN** `/health/whoami` reports the replica as `instanceId` and the deployment as `deploymentId`
- **AND** the Git commit is used as `version` when `SERVICE_VERSION` is not explicitly configured
- **AND** no secret or complete environment dump is returned

### Requirement: Externalized production state

Railway application services SHALL remain stateless and replaceable. Production RabbitMQ, Redis and the system-of-record database SHALL use durable managed services or an explicitly documented equivalent that owns persistence, backups and recovery outside the API and Consumer filesystems.

#### Scenario: Railway application container is replaced

- **WHEN** an API, Consumer or Cron publisher container is restarted or replaced
- **THEN** business facts, durable job state, queued commands and required shared coordination state remain available from their designated external owners

#### Scenario: Redis data is unavailable

- **WHEN** Redis loses rebuildable cache or short-lived coordination data
- **THEN** RabbitMQ commands and database business or idempotency records remain authoritative

### Requirement: External scheduling and durable command publication

Production-critical schedules SHALL NOT be owned by ordinary NestJS API replicas. A Railway Cron service SHALL start a short-lived publisher process, create a versioned command with a deterministic idempotency key, publish it to RabbitMQ with confirmation, close its resources and exit. The always-on Consumer SHALL execute the use case and acknowledge the message only after required durable side effects complete.

#### Scenario: Scheduled occurrence is triggered

- **WHEN** Railway starts a configured Cron occurrence
- **THEN** the Cron publisher emits the corresponding persistent RabbitMQ command and exits without running the long-running business operation

#### Scenario: API is unavailable during a schedule

- **WHEN** the public API is restarting or unavailable at the scheduled time
- **THEN** the Cron publisher can publish without routing the trigger through the public API process

#### Scenario: Consumer receives a redelivered command

- **WHEN** RabbitMQ redelivers a command after a Consumer interruption
- **THEN** the Consumer uses the command's idempotency key and durable records to prevent duplicate business side effects

#### Scenario: Schedule frequency exceeds Railway Cron capability

- **WHEN** a schedule requires an interval shorter than five minutes or a different scheduling guarantee
- **THEN** that schedule requires a separately documented scheduler decision rather than an in-process API `@Cron()` fallback

### Requirement: Turborepo-aware Railway builds

Each Railway application service SHALL build the shared pnpm workspace from the repository root, scope its build and start commands to the intended workspace, and trigger a redeploy when either the application or any relevant shared package or root build input changes.

#### Scenario: Business service code changes

- **WHEN** a file under `apps/agentic-rag-business-service` changes
- **THEN** each affected Railway backend service is eligible for a new deployment using a filtered Turbo build

#### Scenario: Shared runtime contract changes

- **WHEN** a file under `packages/contracts` or a relevant root workspace build file changes
- **THEN** Railway does not skip the dependent backend deployment merely because the application directory itself was unchanged

#### Scenario: Unrelated frontend-only code changes

- **WHEN** only files outside a Railway backend service and its dependency closure change
- **THEN** that backend service may skip deployment through its configured Watch Paths

### Requirement: Cache-safe environment handling

Any environment variable whose value is embedded into a build artifact SHALL contribute to the corresponding Turbo task hash. Runtime-only secrets and ports MAY pass through without affecting the task hash.

#### Scenario: Public frontend API origin changes

- **WHEN** `NEXT_PUBLIC_API_BASE_URL` changes between builds
- **THEN** Turbo treats the frontend build as changed and does not restore an artifact containing the previous public origin

#### Scenario: Runtime port changes

- **WHEN** Railway supplies a different runtime `PORT` without changing source or build inputs
- **THEN** the service can use the new port without requiring it to alter the Turbo build cache key
