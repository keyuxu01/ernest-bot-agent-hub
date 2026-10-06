# Assistant Runtime Environment

The Assistant uses three independent state layers. Environment configuration must preserve their boundaries:

| Layer      | Runtime responsibility                                                      | Source of truth                                     |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| PostgreSQL | Sessions, Runs, ordered events, commands, tools, interrupts and checkpoints | Yes                                                 |
| Redis      | Reconstructable hot windows, leases, coordination and SSE fan-out           | No                                                  |
| Mem0       | Extracted owner/session facts with provenance                               | Only for memory entries; never conversation history |

The committed templates are [`apps/assistant-runtime-service/.env.example`](../../apps/assistant-runtime-service/.env.example), [`apps/user-platform-service/.env.example`](../../apps/user-platform-service/.env.example), and [`apps/assistant-cli/.env.example`](../../apps/assistant-cli/.env.example). Copy the relevant template to an ignored local environment file. Production secrets belong in the deployment secret store and must not be committed.

## PostgreSQL

| Variable                              | Required | Meaning                                                                                    |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `POSTGRES_HOST` / `POSTGRES_PORT`     | Yes      | Runtime database endpoint                                                                  |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Yes      | Application credential; do not reuse an administrator credential in production             |
| `POSTGRES_DB`                         | Yes      | Shared physical database, locally `agent_hub`                                              |
| `POSTGRES_SCHEMA`                     | Yes      | Assistant-owned schema, default `assistant_runtime`                                        |
| `POSTGRES_POOL_SIZE`                  | Yes      | Per-replica pool maximum; total capacity must account for all replicas and workers         |
| `POSTGRES_SSL`                        | Yes      | Transport TLS switch; provider certificate options will be added with the database adapter |

The Runtime uses the repository's existing PostgreSQL instance rather than starting a second database. Production schema changes use migrations with `synchronize: false`.

## Redis

| Variable                      | Required | Meaning                                                                    |
| ----------------------------- | -------- | -------------------------------------------------------------------------- |
| `REDIS_URL`                   | Yes      | `redis://` locally or `rediss://` when TLS is required                     |
| `REDIS_KEY_PREFIX`            | Yes      | Environment/product/protocol namespace; do not share an unversioned prefix |
| `REDIS_HOT_STATE_TTL_SECONDS` | Yes      | Reconstructable Session window lifetime; default 1800 seconds              |
| `REDIS_LEASE_TTL_MS`          | Yes      | Run-owner lease lifetime; default 15 seconds and renewed before expiry     |
| `REDIS_COMMAND_TIMEOUT_MS`    | Yes      | Finite Redis command bound; default 5 seconds                              |

Redis loss must not lose confirmed history, checkpoints, ToolExecution results or command idempotency. A URL may contain a password, so logs and health responses must redact it.

## Mem0

| Variable                  | Required | Meaning                                                                 |
| ------------------------- | -------- | ----------------------------------------------------------------------- |
| `MEM0_MODE`               | Yes      | Must be `platform` in this release                                      |
| `MEM0_API_KEY`            | Yes      | Hosted Mem0 Platform credential                                         |
| `MEM0_AGENT_ID`           | Yes      | Stable product scope, default `agent-hub-assistant`                     |
| `MEM0_TOP_K`              | Yes      | Maximum recalled candidates per scope before product filtering          |
| `MEM0_REQUEST_TIMEOUT_MS` | Yes      | Finite add/search/update/delete request timeout                         |
| `MEM0_EXTRACTION_ENABLED` | Yes      | Enables post-Turn extraction; disabling does not affect durable history |

`userId` comes from authenticated UserPlatform identity and `runId`/Session scope comes from the owned Runtime resource. They are request data and must never be configured as global environment variables. Mem0 recall is injected temporarily; it is not written back as a user or assistant event.

Phase 1 deliberately uses Mem0 Platform only. The Mem0 OSS repository is not part of this monorepo or a Git submodule, and `MEM0_BASE_URL` is rejected at startup. A future self-hosted deployment requires its own OpenSpec change and operational acceptance.

## UserPlatform and access grants

UserPlatform requires PostgreSQL, Google OAuth endpoints and client credentials, an explicit loopback redirect allowlist, EdDSA signing material, encryption-key references, and stable `SERVICE_VERSION` / `SERVICE_BUILD_ID` values. `TOKEN_AUDIENCE` is fixed to `assistant-runtime`, `TOKEN_ALGORITHM` to `EdDSA`, and `ACCESS_TOKEN_TTL_SECONDS` to 300. Runtime receives the matching issuer, key ID, public key and audience and verifies grants locally; neither Nest TCP nor per-request token introspection is configured.

## Object storage, encryption, providers and limits

Runtime requires object-storage endpoint/bucket/credentials and a finite request timeout. `ENCRYPTION_KEY_ID` identifies the active envelope-encryption key while secret material comes from deployment secret management. Provider and MCP calls, request bytes, stream duration, per-user concurrency, per-Run model cost, Redis commands and leases all have explicit finite bounds. Lease renewal must occur before lease expiry.

The repository-owned MCP collection service uses `http://localhost:9021` in development and test so the local stack works without a certificate proxy. This cleartext exception is limited to the loopback host and to `NODE_ENV=development|test`; production and every non-loopback target require HTTPS. Future user-configured remote MCP connections remain public-network HTTPS-only and retain DNS, redirect and connection-time SSRF checks.

## CLI

The CLI uses `http://localhost:9040` for UserPlatform and `http://localhost:9030` for Runtime in development and test. The loopback-only cleartext exception avoids unnecessary local TLS setup; production and every non-loopback target require HTTPS. The CLI also requires a loopback OAuth port, OS credential-store namespace, finite network/local-tool limits, and stable `CLI_VERSION` / `CLI_BUILD_ID`. API keys, access tokens and refresh material are not environment-template values and must be handled by the later credential-store adapter.

### PostgreSQL query-plan regression budget

The migration integration suite loads 5,000 Session rows, 5,000 history Events and 5,000 ready Outbox rows, analyzes the tables, and runs the representative catalog, history, active-Run, expired-lease, pending-tool, pending-interrupt and Outbox queries with `EXPLAIN ANALYZE`. Every query must use its declared index and keep PostgreSQL planning plus execution below 100 ms on the local/CI fixture. This is a regression budget, not a production latency SLO; production SLOs require provider-sized data and deployed telemetry. History pagination intentionally reuses `uq_assistant_event_session_sequence` rather than adding a duplicate index.

## Correlation and build identity

The CLI sends an opaque correlation ID plus client version/build metadata. Both services accept a valid incoming ID or generate a new one and return it in `x-correlation-id`; diagnostic responses and allowlisted structured logs use the same value. Prompts, authorization headers and secret values are excluded from these records.

## Validation and failure behavior

Startup validation rejects blank secrets, any Mem0 mode other than `platform`, invalid URL schemes, invalid booleans and non-positive limits without logging values. Dependency readiness will be added with the concrete adapters. Mem0 unavailability records retryable extraction/recall diagnostics but does not roll back a committed Turn; Redis loss rebuilds projections from PostgreSQL; PostgreSQL unavailability prevents durable command admission.

## References

- [Mem0 Platform JavaScript quickstart](https://docs.mem0.ai/platform/quickstart) — `mem0ai`, `MemoryClient`, API-key authentication and user-scoped add/search.
- [ioredis connection options](https://redis.github.io/ioredis/interfaces/CommonRedisOptions.html) — database, timeouts, retry and connection settings used by the future adapter.
- [TypeORM data-source options](https://typeorm.io/docs/data-source/data-source-options/) — pool sizing, migrations and the production warning for `synchronize`.
