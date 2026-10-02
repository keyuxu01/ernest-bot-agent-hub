# ADR-0013: Use PostgreSQL and MongoDB for Document Persistence

- Status: Accepted
- Date: 2026-10-02

## Context

Knowledge documents have two persistence shapes. Metadata such as ownership, publication state, counters,
categories and timestamps is relational and must support filtered lists. Markdown bodies are larger,
document-shaped values with their own preview, length and version fields.

The repository already operates PostgreSQL and MongoDB locally. The business service needs an explicit owner
for both connections, deterministic entity discovery and startup validation for credentials. Keeping entity
classes in the root application module would invert the dependency from infrastructure configuration back to
individual business features.

## Decision

- Store document metadata in PostgreSQL table `kh_document` through TypeORM.
- Store Markdown bodies in MongoDB collection `document_content` through Mongoose.
- Link the records in both directions: PostgreSQL `content_id` stores the MongoDB ObjectId as a string, while
  MongoDB `documentId` stores the PostgreSQL Snowflake document ID.
- Let `DatabaseModule` own the root TypeORM and Mongoose connections. It reads only validated configuration
  from `ConfigService` and never imports feature entities or schemas.
- Enable TypeORM `autoLoadEntities`; each feature registers its own entities with
  `TypeOrmModule.forFeature`. Each MongoDB feature likewise registers its schemas with
  `MongooseModule.forFeature`.
- Keep TypeORM `synchronize` disabled. Database schema changes require migrations rather than production
  startup mutation.
- Validate required PostgreSQL and MongoDB variables during application bootstrap. Do not silently fall back
  to embedded production credentials.
- Treat a write spanning PostgreSQL and MongoDB as a distributed operation without cross-database ACID
  guarantees. Each workflow must define compensation, idempotency or retry behavior for partial failure.

## Consequences

- `AppModule` remains a composition root instead of owning feature-specific entity lists.
- Adding a TypeORM entity requires `forFeature` in its owning feature module. Injecting the default
  `EntityManager` alone does not require `forFeature`; entity discovery through `autoLoadEntities` does.
- Lists can query PostgreSQL without loading complete Markdown bodies from MongoDB.
- Referential integrity between the stores is enforced by application behavior and reconciliation, not a
  database foreign key.
- Local and deployed services must provide both database connections even when an endpoint does not access
  document data, because the application initializes its root module graph at startup.
- E2E tests that import `AppModule` are integration tests and require isolated PostgreSQL and MongoDB test
  instances or explicit test-module replacements.

## Alternatives

- Store complete documents in PostgreSQL: simpler transactional semantics, but rejected for the current
  domain model because document content and metadata have intentionally separate storage lifecycles.
- Store all fields in MongoDB: rejected because relational metadata queries and future ownership constraints
  belong in the system-of-record relational database.
- List every entity in `TypeOrmModule.forRoot`: functional, but rejected because the infrastructure module
  would depend on every feature and must be edited whenever a feature adds an entity.
- Use TypeORM entity globs: rejected because emitted paths and test paths are easier to misconfigure than
  explicit feature ownership with `forFeature` and `autoLoadEntities`.
