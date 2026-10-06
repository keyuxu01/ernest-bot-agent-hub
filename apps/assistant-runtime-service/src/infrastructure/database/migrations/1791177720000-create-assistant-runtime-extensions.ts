import type { MigrationInterface, QueryRunner } from 'typeorm';
import { validatePostgresSchemaName } from '../../../config/environment';

const schemaName = (): string =>
  validatePostgresSchemaName(process.env.POSTGRES_SCHEMA ?? 'assistant_runtime');

/**
 * Assistant Runtime 的耐久扩展表。
 *
 * 本迁移只定义 4.2 的数据形状和所有权/血缘外键。事件、命令、活跃 Run、
 * 终态工具结果和当前租约的业务唯一性由 4.3 单独建立，避免提前锁死并发语义。
 */
export class CreateAssistantRuntimeExtensions1791177720000 implements MigrationInterface {
  readonly name = 'CreateAssistantRuntimeExtensions1791177720000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();

    // 仅为复合外键提供候选键；它们不表达 4.3 的业务唯一性。
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_run"
        ADD CONSTRAINT "uq_assistant_run_session_owner" UNIQUE ("run_id", "session_id", "owner_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_turn"
        ADD CONSTRAINT "uq_assistant_turn_run_owner" UNIQUE ("turn_id", "run_id", "owner_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_mcp_connection" (
        "connection_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "display_name" varchar(128) NOT NULL,
        "transport" varchar(16) NOT NULL DEFAULT 'https',
        "endpoint" text NOT NULL,
        "auth_secret_reference" varchar(256) NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "status" varchar(32) NOT NULL DEFAULT 'disabled',
        "catalog_generation" bigint NULL,
        "checked_at" timestamptz NULL,
        "retry_at" timestamptz NULL,
        "revoked_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_assistant_mcp_connection_owner" UNIQUE ("connection_id", "owner_id"),
        CONSTRAINT "ck_assistant_mcp_connection_identity" CHECK (char_length("connection_id") > 0 AND char_length("owner_id") > 0 AND char_length(btrim("display_name")) > 0),
        CONSTRAINT "ck_assistant_mcp_connection_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0),
        CONSTRAINT "ck_assistant_mcp_connection_transport" CHECK ("transport" = 'https' AND "endpoint" ~ '^https://[^[:space:]@]+'),
        CONSTRAINT "ck_assistant_mcp_connection_secret_reference" CHECK ("auth_secret_reference" IS NULL OR "auth_secret_reference" ~ '^secret://[A-Za-z0-9._/-]{1,240}$'),
        CONSTRAINT "ck_assistant_mcp_connection_status" CHECK ("status" IN ('disabled', 'authorization_required', 'connecting', 'ready', 'degraded', 'revoked')),
        CONSTRAINT "ck_assistant_mcp_connection_lifecycle" CHECK (
          (NOT "enabled" AND "status" = 'disabled' AND "revoked_at" IS NULL)
          OR ("enabled" AND "status" IN ('authorization_required', 'connecting', 'ready', 'degraded') AND "revoked_at" IS NULL)
          OR (NOT "enabled" AND "status" = 'revoked' AND "revoked_at" IS NOT NULL)
        ),
        CONSTRAINT "ck_assistant_mcp_connection_catalog" CHECK ("catalog_generation" IS NULL OR "catalog_generation" > 0),
        CONSTRAINT "ck_assistant_mcp_connection_retry" CHECK ("retry_at" IS NULL OR "checked_at" IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_client_binding" (
        "binding_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "cli_instance_id" varchar(128) NOT NULL,
        "workspace_id" varchar(128) NOT NULL,
        "workspace_fingerprint" bytea NOT NULL,
        "stream_secret_reference" varchar(256) NOT NULL,
        "capabilities" jsonb NOT NULL,
        "approval_policy" jsonb NOT NULL,
        "lease_version" bigint NOT NULL DEFAULT 0,
        "fencing_token" bigint NOT NULL DEFAULT 0,
        "lease_expires_at" timestamptz NOT NULL,
        "lifecycle_state" varchar(32) NOT NULL DEFAULT 'Active',
        "offline_at" timestamptz NULL,
        "revoked_at" timestamptz NULL,
        "replaced_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_assistant_client_binding_owner" UNIQUE ("binding_id", "owner_id"),
        CONSTRAINT "fk_assistant_client_binding_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_client_binding_identity" CHECK (char_length("binding_id") > 0 AND char_length("owner_id") > 0 AND char_length("cli_instance_id") > 0 AND char_length("workspace_id") > 0),
        CONSTRAINT "ck_assistant_client_binding_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0 AND "lease_version" >= 0 AND "fencing_token" >= 0),
        CONSTRAINT "ck_assistant_client_binding_fingerprint" CHECK (octet_length("workspace_fingerprint") = 32),
        CONSTRAINT "ck_assistant_client_binding_secret_reference" CHECK ("stream_secret_reference" ~ '^secret://[A-Za-z0-9._/-]{1,240}$'),
        CONSTRAINT "ck_assistant_client_binding_capabilities" CHECK (jsonb_typeof("capabilities") = 'array' AND jsonb_array_length("capabilities") BETWEEN 1 AND 32),
        CONSTRAINT "ck_assistant_client_binding_policy" CHECK (jsonb_typeof("approval_policy") = 'object'),
        CONSTRAINT "ck_assistant_client_binding_lifecycle" CHECK ("lifecycle_state" IN ('Active', 'Offline', 'Revoked', 'Replaced')),
        CONSTRAINT "ck_assistant_client_binding_lifecycle_time" CHECK (
          "lease_expires_at" >= "created_at" AND (
            ("lifecycle_state" = 'Active' AND "offline_at" IS NULL AND "revoked_at" IS NULL AND "replaced_at" IS NULL)
            OR ("lifecycle_state" = 'Offline' AND "offline_at" >= "created_at" AND "revoked_at" IS NULL AND "replaced_at" IS NULL)
            OR ("lifecycle_state" = 'Revoked' AND "revoked_at" >= "created_at" AND "replaced_at" IS NULL)
            OR ("lifecycle_state" = 'Replaced' AND "replaced_at" >= "created_at" AND "revoked_at" IS NULL)
          )
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_context_snapshot" (
        "snapshot_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NOT NULL,
        "turn_id" varchar(128) NOT NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "workspace_id" varchar(128) NOT NULL,
        "manifest_sha256" bytea NOT NULL,
        "source_manifest" jsonb NOT NULL,
        "content_artifact_reference_id" varchar(128) NULL,
        "lifecycle_state" varchar(32) NOT NULL DEFAULT 'Active',
        "accepted_at" timestamptz NOT NULL,
        "superseded_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_assistant_context_snapshot_owner" UNIQUE ("snapshot_id", "owner_id"),
        CONSTRAINT "fk_assistant_context_snapshot_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_context_snapshot_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_context_snapshot_turn_lineage" FOREIGN KEY ("turn_id", "run_id", "owner_id") REFERENCES "${schema}"."assistant_turn" ("turn_id", "run_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_context_snapshot_identity" CHECK (char_length("snapshot_id") > 0 AND char_length("owner_id") > 0 AND char_length("session_id") > 0 AND char_length("run_id") > 0 AND char_length("turn_id") > 0 AND char_length("workspace_id") > 0),
        CONSTRAINT "ck_assistant_context_snapshot_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0),
        CONSTRAINT "ck_assistant_context_snapshot_hash" CHECK (octet_length("manifest_sha256") = 32),
        CONSTRAINT "ck_assistant_context_snapshot_lifecycle" CHECK (("lifecycle_state" = 'Active' AND "superseded_at" IS NULL) OR ("lifecycle_state" = 'Superseded' AND "superseded_at" IS NOT NULL AND "superseded_at" >= "accepted_at")),
        CONSTRAINT "ck_assistant_context_snapshot_manifest" CHECK (
          jsonb_typeof("source_manifest") = 'array'
          AND jsonb_array_length("source_manifest") <= 512
          AND NOT jsonb_path_exists("source_manifest", '$[*] ? (@.type() != "object")')
          AND NOT jsonb_path_exists("source_manifest", '$[*] ? (!exists(@.relativePath) || !exists(@.sha256) || !exists(@.kind) || !exists(@.trust) || !exists(@.contentReference))')
          AND NOT jsonb_path_exists("source_manifest", '$[*] ? (@.relativePath like_regex "^(\\/|[A-Za-z]:|.*(^|\\/)\\.\\.(\\/|$))")')
          AND NOT jsonb_path_exists("source_manifest", '$[*] ? (!(@.sha256 like_regex "^[a-f0-9]{64}$"))')
          AND NOT jsonb_path_exists("source_manifest", '$[*] ? (!(@.kind == "agents" || @.kind == "skill" || @.kind == "explicit"))')
          AND NOT jsonb_path_exists("source_manifest", '$[*] ? (!(@.trust == "workspace_instruction" || @.trust == "user_selected" || @.trust == "untrusted_content"))')
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_event" (
        "event_row_id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "event_id" varchar(128) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NULL,
        "sequence" bigint NOT NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "event_type" varchar(32) NOT NULL,
        "payload_version" smallint NOT NULL DEFAULT 1,
        "payload" jsonb NOT NULL,
        "payload_sha256" bytea NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_assistant_event_owner_row" UNIQUE ("event_row_id", "owner_id"),
        CONSTRAINT "uq_assistant_event_session_row" UNIQUE ("event_row_id", "session_id", "owner_id"),
        CONSTRAINT "uq_assistant_event_type_session_row" UNIQUE ("event_row_id", "event_type", "session_id", "owner_id"),
        CONSTRAINT "uq_assistant_event_sequence_session_row" UNIQUE ("event_row_id", "sequence", "session_id", "owner_id"),
        CONSTRAINT "uq_assistant_event_sequence_run_row" UNIQUE ("event_row_id", "sequence", "run_id", "session_id", "owner_id"),
        CONSTRAINT "fk_assistant_event_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_event_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_event_identity" CHECK (char_length("owner_id") > 0 AND char_length("event_id") > 0 AND char_length("session_id") > 0),
        CONSTRAINT "ck_assistant_event_versions" CHECK ("schema_version" = 1 AND "payload_version" = 1 AND "sequence" >= 0),
        CONSTRAINT "ck_assistant_event_type" CHECK ("event_type" IN ('message', 'reasoning', 'plan', 'tool', 'interrupt', 'compaction', 'run_state', 'usage', 'artifact', 'terminal')),
        CONSTRAINT "ck_assistant_event_payload" CHECK (jsonb_typeof("payload") = 'object' AND "payload" ->> 'type' = "event_type"),
        CONSTRAINT "ck_assistant_event_payload_hash" CHECK (octet_length("payload_sha256") = 32)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_outbox" (
        "outbox_row_id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NULL,
        "event_row_id" bigint NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "payload_version" smallint NOT NULL DEFAULT 1,
        "topic" varchar(128) NOT NULL,
        "aggregate_type" varchar(64) NOT NULL,
        "aggregate_id" varchar(128) NOT NULL,
        "aggregate_sequence" bigint NOT NULL,
        "payload" jsonb NOT NULL,
        "payload_sha256" bytea NOT NULL,
        "state" varchar(32) NOT NULL DEFAULT 'Pending',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "claimed_by" varchar(128) NULL,
        "available_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "claimed_at" timestamptz NULL,
        "published_at" timestamptz NULL,
        "last_error_code" varchar(128) NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fk_assistant_outbox_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_outbox_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_outbox_event_lineage" FOREIGN KEY ("event_row_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_event" ("event_row_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_outbox_identity" CHECK (char_length("owner_id") > 0 AND char_length("session_id") > 0 AND char_length("topic") > 0 AND char_length("aggregate_type") > 0 AND char_length("aggregate_id") > 0),
        CONSTRAINT "ck_assistant_outbox_versions" CHECK ("schema_version" = 1 AND "payload_version" = 1 AND "aggregate_sequence" >= 0 AND "attempt_count" >= 0),
        CONSTRAINT "ck_assistant_outbox_payload" CHECK (jsonb_typeof("payload") = 'object' AND octet_length("payload_sha256") = 32),
        CONSTRAINT "ck_assistant_outbox_state" CHECK ("state" IN ('Pending', 'Claimed', 'Completed', 'RetryableFailure', 'Poisoned')),
        CONSTRAINT "ck_assistant_outbox_state_time" CHECK (
          ("state" = 'Pending' AND "claimed_by" IS NULL AND "claimed_at" IS NULL AND "published_at" IS NULL AND "last_error_code" IS NULL)
          OR ("state" = 'Claimed' AND "claimed_by" IS NOT NULL AND "claimed_at" IS NOT NULL AND "published_at" IS NULL AND "last_error_code" IS NULL)
          OR ("state" = 'Completed' AND "claimed_by" IS NOT NULL AND "claimed_at" IS NOT NULL AND "published_at" IS NOT NULL AND "last_error_code" IS NULL)
          OR ("state" IN ('RetryableFailure', 'Poisoned') AND "claimed_by" IS NOT NULL AND "claimed_at" IS NOT NULL AND "published_at" IS NULL AND "last_error_code" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_checkpoint" (
        "checkpoint_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NOT NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "thread_id" varchar(128) NOT NULL,
        "checkpoint_version" bigint NOT NULL,
        "encryption_version" smallint NOT NULL DEFAULT 1,
        "codec_version" smallint NOT NULL DEFAULT 1,
        "run_resource_version" bigint NOT NULL,
        "last_event_sequence" bigint NOT NULL,
        "ciphertext" bytea NOT NULL,
        "ciphertext_sha256" bytea NOT NULL,
        "encryption_key_reference" varchar(256) NOT NULL,
        "encryption_nonce" bytea NOT NULL,
        "encryption_auth_tag" bytea NOT NULL,
        "compression" varchar(16) NOT NULL DEFAULT 'none',
        "state" varchar(32) NOT NULL DEFAULT 'Ready',
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "quarantined_at" timestamptz NULL,
        CONSTRAINT "uq_assistant_checkpoint_owner" UNIQUE ("checkpoint_id", "owner_id"),
        CONSTRAINT "uq_assistant_checkpoint_lineage" UNIQUE ("checkpoint_id", "run_id", "session_id", "owner_id"),
        CONSTRAINT "fk_assistant_checkpoint_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_checkpoint_identity" CHECK (char_length("checkpoint_id") > 0 AND char_length("owner_id") > 0 AND char_length("session_id") > 0 AND char_length("run_id") > 0 AND char_length("thread_id") > 0),
        CONSTRAINT "ck_assistant_checkpoint_versions" CHECK ("schema_version" = 1 AND "encryption_version" = 1 AND "codec_version" = 1 AND "resource_version" >= 0 AND "checkpoint_version" >= 0 AND "run_resource_version" >= 0 AND "last_event_sequence" >= 0),
        CONSTRAINT "ck_assistant_checkpoint_ciphertext" CHECK (octet_length("ciphertext") > 0 AND octet_length("ciphertext_sha256") = 32 AND octet_length("encryption_nonce") = 12 AND octet_length("encryption_auth_tag") = 16),
        CONSTRAINT "ck_assistant_checkpoint_key_reference" CHECK ("encryption_key_reference" ~ '^secret://[A-Za-z0-9._/-]{1,240}$'),
        CONSTRAINT "ck_assistant_checkpoint_compression" CHECK ("compression" IN ('none', 'gzip', 'zstd')),
        CONSTRAINT "ck_assistant_checkpoint_state" CHECK ("state" IN ('Ready', 'Quarantined', 'Superseded')),
        CONSTRAINT "ck_assistant_checkpoint_quarantine" CHECK (("state" = 'Quarantined') = ("quarantined_at" IS NOT NULL))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_compaction" (
        "compaction_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "mode" varchar(16) NOT NULL,
        "covered_from_sequence" bigint NOT NULL,
        "covered_through_sequence" bigint NOT NULL,
        "summary_event_row_id" bigint NULL,
        "summary_event_type" varchar(32) NULL,
        "model" varchar(256) NOT NULL,
        "catalog_generation" bigint NULL,
        "input_tokens" bigint NOT NULL,
        "output_tokens" bigint NOT NULL,
        "retained_invariants" jsonb NOT NULL,
        "state" varchar(32) NOT NULL DEFAULT 'Pending',
        "failure_code" varchar(128) NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" timestamptz NULL,
        CONSTRAINT "fk_assistant_compaction_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_compaction_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_compaction_summary_event_lineage" FOREIGN KEY ("summary_event_row_id", "summary_event_type", "session_id", "owner_id") REFERENCES "${schema}"."assistant_event" ("event_row_id", "event_type", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_compaction_identity" CHECK (char_length("compaction_id") > 0 AND char_length("owner_id") > 0 AND char_length("session_id") > 0 AND char_length(btrim("model")) > 0),
        CONSTRAINT "ck_assistant_compaction_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0 AND "covered_from_sequence" >= 0 AND "covered_through_sequence" >= "covered_from_sequence"),
        CONSTRAINT "ck_assistant_compaction_mode" CHECK ("mode" IN ('automatic', 'forced')),
        CONSTRAINT "ck_assistant_compaction_usage" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0 AND ("catalog_generation" IS NULL OR "catalog_generation" > 0)),
        CONSTRAINT "ck_assistant_compaction_invariants" CHECK (jsonb_typeof("retained_invariants") = 'array'),
        CONSTRAINT "ck_assistant_compaction_state" CHECK ("state" IN ('Pending', 'Committed', 'Failed')),
        CONSTRAINT "ck_assistant_compaction_completion" CHECK (
          ("state" = 'Pending' AND "completed_at" IS NULL AND "summary_event_row_id" IS NULL AND "summary_event_type" IS NULL AND "failure_code" IS NULL)
          OR ("state" = 'Committed' AND "completed_at" IS NOT NULL AND "summary_event_row_id" IS NOT NULL AND "summary_event_type" = 'compaction' AND "failure_code" IS NULL)
          OR ("state" = 'Failed' AND "completed_at" IS NOT NULL AND "summary_event_row_id" IS NULL AND "summary_event_type" IS NULL AND "failure_code" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_tool_execution" (
        "execution_row_id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "execution_id" varchar(128) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NOT NULL,
        "turn_id" varchar(128) NULL,
        "binding_id" varchar(128) NULL,
        "mcp_connection_id" varchar(128) NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "tool_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "location" varchar(16) NOT NULL,
        "tool_name" varchar(256) NOT NULL,
        "tool_schema_hash" bytea NOT NULL,
        "catalog_generation" bigint NULL,
        "attempt" integer NOT NULL,
        "request_hash" bytea NOT NULL,
        "request_payload" jsonb NOT NULL,
        "idempotency_class" varchar(32) NOT NULL,
        "fencing_token" bigint NOT NULL,
        "state" varchar(32) NOT NULL DEFAULT 'Pending',
        "result_payload" jsonb NULL,
        "result_hash" bytea NULL,
        "error_code" varchar(128) NULL,
        "error_message" varchar(4096) NULL,
        "retryable" boolean NULL,
        "rejection_reason" varchar(4096) NULL,
        "current_content_hash" bytea NULL,
        "result_unknown_reason" varchar(4096) NULL,
        "may_have_side_effects" boolean NULL,
        "cancellation_outcome" varchar(16) NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "acknowledged_at" timestamptz NULL,
        "completed_at" timestamptz NULL,
        CONSTRAINT "uq_assistant_tool_execution_owner_row" UNIQUE ("execution_row_id", "owner_id"),
        CONSTRAINT "uq_assistant_tool_execution_lineage" UNIQUE ("execution_row_id", "run_id", "session_id", "owner_id"),
        CONSTRAINT "fk_assistant_tool_execution_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_tool_execution_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_tool_execution_turn_lineage" FOREIGN KEY ("turn_id", "run_id", "owner_id") REFERENCES "${schema}"."assistant_turn" ("turn_id", "run_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_tool_execution_binding_owner" FOREIGN KEY ("binding_id", "owner_id") REFERENCES "${schema}"."assistant_client_binding" ("binding_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_tool_execution_mcp_owner" FOREIGN KEY ("mcp_connection_id", "owner_id") REFERENCES "${schema}"."assistant_mcp_connection" ("connection_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_tool_execution_identity" CHECK (char_length("owner_id") > 0 AND char_length("execution_id") > 0 AND char_length("session_id") > 0 AND char_length("run_id") > 0 AND char_length("tool_name") > 0),
        CONSTRAINT "ck_assistant_tool_execution_versions" CHECK ("schema_version" = 1 AND "tool_version" = 1 AND "resource_version" >= 0 AND "attempt" > 0 AND "fencing_token" >= 0),
        CONSTRAINT "ck_assistant_tool_execution_hashes" CHECK (octet_length("tool_schema_hash") = 32 AND octet_length("request_hash") = 32 AND ("result_hash" IS NULL OR octet_length("result_hash") = 32)),
        CONSTRAINT "ck_assistant_tool_execution_payload" CHECK (jsonb_typeof("request_payload") = 'object' AND ("result_payload" IS NULL OR jsonb_typeof("result_payload") = 'object')),
        CONSTRAINT "ck_assistant_tool_execution_location" CHECK (
          ("location" = 'local' AND "binding_id" IS NOT NULL AND "mcp_connection_id" IS NULL AND "catalog_generation" IS NULL)
          OR ("location" = 'remote_mcp' AND "binding_id" IS NULL AND "mcp_connection_id" IS NOT NULL AND "catalog_generation" > 0)
          OR ("location" IN ('runtime', 'remote_service') AND "binding_id" IS NULL AND "mcp_connection_id" IS NULL AND "catalog_generation" IS NULL)
        ),
        CONSTRAINT "ck_assistant_tool_execution_idempotency" CHECK ("idempotency_class" IN ('safe_retry', 'retry_with_precondition', 'never_automatic_retry')),
        CONSTRAINT "ck_assistant_tool_execution_state" CHECK ("state" IN ('Pending', 'Dispatched', 'Acknowledged', 'Completed', 'Failed', 'Cancelled', 'ResultUnknown', 'Rejected', 'Conflict')),
        CONSTRAINT "ck_assistant_tool_execution_acknowledgement" CHECK (("acknowledged_at" IS NULL) OR "location" = 'local'),
        CONSTRAINT "ck_assistant_tool_execution_completion_time" CHECK (("state" IN ('Completed', 'Failed', 'Cancelled', 'ResultUnknown', 'Rejected', 'Conflict')) = ("completed_at" IS NOT NULL)),
        CONSTRAINT "ck_assistant_tool_execution_result_shape" CHECK (
          ("state" = 'Completed' AND "result_payload" IS NOT NULL AND "result_hash" IS NOT NULL AND "error_code" IS NULL AND "error_message" IS NULL AND "retryable" IS NULL AND "rejection_reason" IS NULL AND "current_content_hash" IS NULL AND "result_unknown_reason" IS NULL AND "may_have_side_effects" IS NULL AND "cancellation_outcome" IS NULL)
          OR ("state" = 'Failed' AND "result_payload" IS NULL AND "result_hash" IS NULL AND "error_code" IS NOT NULL AND char_length("error_code") > 0 AND "error_message" IS NOT NULL AND char_length("error_message") > 0 AND "retryable" IS NOT NULL AND "rejection_reason" IS NULL AND "current_content_hash" IS NULL AND "result_unknown_reason" IS NULL AND "may_have_side_effects" IS NULL AND "cancellation_outcome" IS NULL)
          OR ("state" = 'Cancelled' AND "result_payload" IS NULL AND "result_hash" IS NULL AND "error_code" IS NULL AND "error_message" IS NULL AND "retryable" IS NULL AND "rejection_reason" IS NULL AND "current_content_hash" IS NULL AND "result_unknown_reason" IS NULL AND "may_have_side_effects" IS NULL AND "cancellation_outcome" IN ('observed', 'unknown'))
          OR ("state" = 'ResultUnknown' AND "result_payload" IS NULL AND "result_hash" IS NULL AND "error_code" IS NULL AND "error_message" IS NULL AND "retryable" IS NULL AND "rejection_reason" IS NULL AND "current_content_hash" IS NULL AND "result_unknown_reason" IS NOT NULL AND char_length("result_unknown_reason") > 0 AND "may_have_side_effects" IS TRUE AND "cancellation_outcome" IS NULL)
          OR ("state" = 'Conflict' AND "result_payload" IS NULL AND "result_hash" IS NULL AND "error_code" IS NULL AND "error_message" IS NOT NULL AND char_length("error_message") > 0 AND "retryable" IS NULL AND "rejection_reason" IS NULL AND ("current_content_hash" IS NULL OR octet_length("current_content_hash") = 32) AND "result_unknown_reason" IS NULL AND "may_have_side_effects" IS NULL AND "cancellation_outcome" IS NULL)
          OR ("state" = 'Rejected' AND "result_payload" IS NULL AND "result_hash" IS NULL AND "error_code" IS NULL AND "error_message" IS NULL AND "retryable" IS NULL AND "rejection_reason" IS NOT NULL AND char_length("rejection_reason") > 0 AND "current_content_hash" IS NULL AND "result_unknown_reason" IS NULL AND "may_have_side_effects" IS NULL AND "cancellation_outcome" IS NULL)
          OR ("state" IN ('Pending', 'Dispatched', 'Acknowledged') AND "result_payload" IS NULL AND "result_hash" IS NULL AND "error_code" IS NULL AND "error_message" IS NULL AND "retryable" IS NULL AND "rejection_reason" IS NULL AND "current_content_hash" IS NULL AND "result_unknown_reason" IS NULL AND "may_have_side_effects" IS NULL AND "cancellation_outcome" IS NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_interrupt" (
        "interrupt_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NOT NULL,
        "tool_execution_row_id" bigint NULL,
        "checkpoint_id" varchar(128) NOT NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "interrupt_type" varchar(16) NOT NULL,
        "prompt_payload" jsonb NOT NULL,
        "prompt_hash" bytea NOT NULL,
        "answer_format" jsonb NOT NULL,
        "display_policy" jsonb NOT NULL,
        "allowed_responders" jsonb NOT NULL,
        "state" varchar(32) NOT NULL DEFAULT 'Pending',
        "resolution_kind" varchar(32) NULL,
        "responder_binding_id" varchar(128) NULL,
        "resolution_command_id" varchar(128) NULL,
        "resolution_idempotency_key" varchar(256) NULL,
        "resolution_reason" varchar(4096) NULL,
        "answer_ciphertext" bytea NULL,
        "answer_sha256" bytea NULL,
        "answer_key_reference" varchar(256) NULL,
        "answer_nonce" bytea NULL,
        "answer_auth_tag" bytea NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "resolved_at" timestamptz NULL,
        CONSTRAINT "fk_assistant_interrupt_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_interrupt_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_interrupt_tool_lineage" FOREIGN KEY ("tool_execution_row_id", "run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_tool_execution" ("execution_row_id", "run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_interrupt_checkpoint_lineage" FOREIGN KEY ("checkpoint_id", "run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_checkpoint" ("checkpoint_id", "run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_interrupt_responder_binding_owner" FOREIGN KEY ("responder_binding_id", "owner_id") REFERENCES "${schema}"."assistant_client_binding" ("binding_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_interrupt_identity" CHECK (char_length("interrupt_id") > 0 AND char_length("owner_id") > 0 AND char_length("session_id") > 0 AND char_length("run_id") > 0),
        CONSTRAINT "ck_assistant_interrupt_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0),
        CONSTRAINT "ck_assistant_interrupt_type" CHECK ("interrupt_type" IN ('question', 'approval')),
        CONSTRAINT "ck_assistant_interrupt_prompt" CHECK (jsonb_typeof("prompt_payload") = 'object' AND octet_length("prompt_hash") = 32 AND jsonb_typeof("answer_format") = 'object' AND jsonb_typeof("display_policy") = 'object' AND jsonb_typeof("allowed_responders") = 'array' AND jsonb_array_length("allowed_responders") > 0),
        CONSTRAINT "ck_assistant_interrupt_state" CHECK (
          ("interrupt_type" = 'question' AND "state" IN ('Pending', 'Answered', 'Cancelled'))
          OR ("interrupt_type" = 'approval' AND "state" IN ('Pending', 'Approved', 'Rejected', 'Cancelled'))
        ),
        CONSTRAINT "ck_assistant_interrupt_resolution_kind" CHECK (
          ("state" = 'Pending' AND "resolution_kind" IS NULL)
          OR ("state" = 'Answered' AND "resolution_kind" = 'answer')
          OR ("state" = 'Approved' AND "resolution_kind" = 'approve')
          OR ("state" = 'Rejected' AND "resolution_kind" = 'reject')
          OR ("state" = 'Cancelled' AND "resolution_kind" = 'cancel')
        ),
        CONSTRAINT "ck_assistant_interrupt_resolution" CHECK (
          ("state" = 'Pending' AND "resolution_kind" IS NULL AND "responder_binding_id" IS NULL AND "resolution_command_id" IS NULL AND "resolution_idempotency_key" IS NULL AND "resolution_reason" IS NULL AND "resolved_at" IS NULL AND "answer_ciphertext" IS NULL AND "answer_sha256" IS NULL AND "answer_key_reference" IS NULL AND "answer_nonce" IS NULL AND "answer_auth_tag" IS NULL)
          OR (
            "state" <> 'Pending' AND "resolution_kind" IS NOT NULL AND "responder_binding_id" IS NOT NULL AND "resolution_command_id" IS NOT NULL AND "resolution_idempotency_key" IS NOT NULL AND "resolved_at" IS NOT NULL
            AND (
              ("state" = 'Answered' AND "interrupt_type" = 'question' AND "resolution_reason" IS NULL AND "answer_ciphertext" IS NOT NULL AND octet_length("answer_ciphertext") > 0 AND "answer_sha256" IS NOT NULL AND octet_length("answer_sha256") = 32 AND "answer_key_reference" IS NOT NULL AND "answer_key_reference" ~ '^secret://[A-Za-z0-9._/-]{1,240}$' AND "answer_nonce" IS NOT NULL AND octet_length("answer_nonce") = 12 AND "answer_auth_tag" IS NOT NULL AND octet_length("answer_auth_tag") = 16)
              OR ("state" = 'Approved' AND "interrupt_type" = 'approval' AND "resolution_reason" IS NULL AND "answer_ciphertext" IS NULL AND "answer_sha256" IS NULL AND "answer_key_reference" IS NULL AND "answer_nonce" IS NULL AND "answer_auth_tag" IS NULL)
          OR ("state" IN ('Rejected', 'Cancelled') AND "resolution_reason" IS NOT NULL AND char_length("resolution_reason") > 0 AND "answer_ciphertext" IS NULL AND "answer_sha256" IS NULL AND "answer_key_reference" IS NULL AND "answer_nonce" IS NULL AND "answer_auth_tag" IS NULL)
            )
          )
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_artifact" (
        "artifact_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NOT NULL,
        "tool_execution_row_id" bigint NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "kind" varchar(16) NOT NULL,
        "mime_type" varchar(255) NOT NULL,
        "content_sha256" bytea NOT NULL,
        "byte_size" bigint NOT NULL,
        "storage_reference_id" varchar(256) NOT NULL,
        "width" integer NULL,
        "height" integer NULL,
        "frame_count" integer NULL,
        "lifecycle_state" varchar(32) NOT NULL DEFAULT 'Committed',
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletion_requested_at" timestamptz NULL,
        "deleted_at" timestamptz NULL,
        CONSTRAINT "uq_assistant_artifact_owner" UNIQUE ("artifact_id", "owner_id"),
        CONSTRAINT "uq_assistant_artifact_lineage" UNIQUE ("artifact_id", "run_id", "session_id", "owner_id"),
        CONSTRAINT "fk_assistant_artifact_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_artifact_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_artifact_tool_lineage" FOREIGN KEY ("tool_execution_row_id", "run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_tool_execution" ("execution_row_id", "run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_artifact_identity" CHECK (char_length("artifact_id") > 0 AND char_length("owner_id") > 0 AND char_length("session_id") > 0 AND char_length("run_id") > 0 AND char_length("storage_reference_id") > 0),
        CONSTRAINT "ck_assistant_artifact_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0),
        CONSTRAINT "ck_assistant_artifact_content" CHECK (octet_length("content_sha256") = 32 AND "byte_size" >= 0 AND "mime_type" ~ '^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$'),
        CONSTRAINT "ck_assistant_artifact_kind" CHECK (
          ("kind" = 'image' AND "mime_type" LIKE 'image/%' AND "byte_size" > 0 AND "width" > 0 AND "height" > 0 AND ("frame_count" IS NULL OR "frame_count" > 0))
          OR ("kind" IN ('text', 'binary') AND "mime_type" NOT LIKE 'image/%' AND "width" IS NULL AND "height" IS NULL AND "frame_count" IS NULL)
        ),
        CONSTRAINT "ck_assistant_artifact_lifecycle" CHECK ("lifecycle_state" IN ('Committed', 'DeletionPending', 'Deleted')),
        CONSTRAINT "ck_assistant_artifact_lifecycle_time" CHECK (
          ("lifecycle_state" = 'Committed' AND "deletion_requested_at" IS NULL AND "deleted_at" IS NULL)
          OR ("lifecycle_state" = 'DeletionPending' AND "deletion_requested_at" IS NOT NULL AND "deleted_at" IS NULL)
          OR ("lifecycle_state" = 'Deleted' AND "deletion_requested_at" IS NOT NULL AND "deleted_at" IS NOT NULL AND "deleted_at" >= "deletion_requested_at")
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_artifact_reference" (
        "reference_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "artifact_id" varchar(128) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "run_id" varchar(128) NOT NULL,
        "event_row_id" bigint NULL,
        "tool_execution_row_id" bigint NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "reference_kind" varchar(32) NOT NULL,
        "lifecycle_state" varchar(32) NOT NULL DEFAULT 'Active',
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "released_at" timestamptz NULL,
        CONSTRAINT "uq_assistant_artifact_reference_owner" UNIQUE ("reference_id", "owner_id"),
        CONSTRAINT "fk_assistant_artifact_reference_artifact_owner" FOREIGN KEY ("artifact_id", "owner_id") REFERENCES "${schema}"."assistant_artifact" ("artifact_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_artifact_reference_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_artifact_reference_run_lineage" FOREIGN KEY ("run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_artifact_reference_event_lineage" FOREIGN KEY ("event_row_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_event" ("event_row_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_artifact_reference_tool_lineage" FOREIGN KEY ("tool_execution_row_id", "run_id", "session_id", "owner_id") REFERENCES "${schema}"."assistant_tool_execution" ("execution_row_id", "run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_artifact_reference_identity" CHECK (char_length("reference_id") > 0 AND char_length("owner_id") > 0 AND char_length("artifact_id") > 0 AND char_length("session_id") > 0 AND char_length("run_id") > 0),
        CONSTRAINT "ck_assistant_artifact_reference_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0),
        CONSTRAINT "ck_assistant_artifact_reference_kind" CHECK ("reference_kind" IN ('event', 'tool_result', 'context', 'fork', 'user')),
        CONSTRAINT "ck_assistant_artifact_reference_lifecycle" CHECK (("lifecycle_state" = 'Active' AND "released_at" IS NULL) OR ("lifecycle_state" = 'Released' AND "released_at" IS NOT NULL))
      )
    `);

    // Context 只持有内容 Artifact 的 owner-scoped 引用，不把可共享 blob 绑定到同一 Run。
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_context_snapshot"
        ADD CONSTRAINT "fk_assistant_context_snapshot_artifact_owner"
        FOREIGN KEY ("content_artifact_reference_id", "owner_id")
        REFERENCES "${schema}"."assistant_artifact_reference" ("reference_id", "owner_id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_memory_operation" (
        "operation_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NULL,
        "source_session_id" varchar(128) NULL,
        "run_id" varchar(128) NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "memory_provider" varchar(32) NOT NULL DEFAULT 'mem0_platform',
        "scope_kind" varchar(16) NOT NULL,
        "operation" varchar(16) NOT NULL,
        "request_hash" bytea NOT NULL,
        "memory_id" varchar(256) NULL,
        "request_payload" jsonb NOT NULL,
        "state" varchar(32) NOT NULL DEFAULT 'pending',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "result_reference" varchar(256) NULL,
        "failure_code" varchar(128) NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" timestamptz NULL,
        CONSTRAINT "uq_assistant_memory_operation_source_lineage" UNIQUE ("operation_id", "owner_id", "source_session_id", "run_id"),
        CONSTRAINT "fk_assistant_memory_operation_session_owner" FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_memory_operation_source_session_owner" FOREIGN KEY ("source_session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_memory_operation_run_lineage" FOREIGN KEY ("run_id", "source_session_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_memory_operation_identity" CHECK (char_length("operation_id") > 0 AND char_length("owner_id") > 0),
        CONSTRAINT "ck_assistant_memory_operation_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0 AND "attempt_count" >= 0),
        CONSTRAINT "ck_assistant_memory_operation_provider" CHECK ("memory_provider" = 'mem0_platform'),
        CONSTRAINT "ck_assistant_memory_operation_scope" CHECK (("scope_kind" = 'owner' AND "session_id" IS NULL) OR ("scope_kind" = 'session' AND "session_id" IS NOT NULL)),
        CONSTRAINT "ck_assistant_memory_operation_source" CHECK (
          ("operation" = 'extract' AND "run_id" IS NOT NULL AND "source_session_id" IS NOT NULL AND ("scope_kind" = 'owner' OR "source_session_id" = "session_id"))
          OR ("operation" <> 'extract' AND "run_id" IS NULL AND "source_session_id" IS NULL)
        ),
        CONSTRAINT "ck_assistant_memory_operation_kind" CHECK ("operation" IN ('recall', 'extract', 'correct', 'delete')),
        CONSTRAINT "ck_assistant_memory_operation_hash" CHECK (octet_length("request_hash") = 32),
        CONSTRAINT "ck_assistant_memory_operation_payload" CHECK (jsonb_typeof("request_payload") = 'object'),
        CONSTRAINT "ck_assistant_memory_operation_target" CHECK (("operation" IN ('correct', 'delete') AND "memory_id" IS NOT NULL) OR ("operation" IN ('recall', 'extract') AND "memory_id" IS NULL)),
        CONSTRAINT "ck_assistant_memory_operation_state" CHECK ("state" IN ('pending', 'completed', 'incomplete_retryable', 'rejected_protected_content')),
        CONSTRAINT "ck_assistant_memory_operation_completion" CHECK (
          ("state" = 'pending' AND "completed_at" IS NULL AND "failure_code" IS NULL AND "result_reference" IS NULL)
          OR ("state" = 'completed' AND "completed_at" IS NOT NULL AND "failure_code" IS NULL)
          OR ("state" IN ('incomplete_retryable', 'rejected_protected_content') AND "completed_at" IS NOT NULL AND "failure_code" IS NOT NULL AND "result_reference" IS NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_memory_operation_source" (
        "source_row_id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "operation_id" varchar(128) NOT NULL,
        "event_row_id" bigint NOT NULL,
        "owner_id" varchar(256) NOT NULL,
        "source_session_id" varchar(128) NOT NULL,
        "source_run_id" varchar(128) NOT NULL,
        "sequence" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fk_assistant_memory_source_operation_lineage" FOREIGN KEY ("operation_id", "owner_id", "source_session_id", "source_run_id") REFERENCES "${schema}"."assistant_memory_operation" ("operation_id", "owner_id", "source_session_id", "run_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_memory_source_event_lineage" FOREIGN KEY ("event_row_id", "sequence", "source_run_id", "source_session_id", "owner_id") REFERENCES "${schema}"."assistant_event" ("event_row_id", "sequence", "run_id", "session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_memory_source_identity" CHECK (char_length("operation_id") > 0 AND char_length("owner_id") > 0 AND char_length("source_session_id") > 0 AND char_length("source_run_id") > 0 AND "sequence" >= 0)
      )
    `);

    // PostgreSQL 的 timestamp cast 负责真实日历校验，正则只收紧为公共契约允许的带 offset ISO 形状。
    await queryRunner.query(`
      CREATE FUNCTION "${schema}"."assistant_is_valid_iso_datetime_with_offset"("value" text)
      RETURNS boolean
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      BEGIN
        IF "value" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
          RETURN false;
        END IF;
        PERFORM "value"::timestamptz;
        RETURN true;
      EXCEPTION WHEN OTHERS THEN
        RETURN false;
      END
      $function$
    `);
    await queryRunner.query(`
      CREATE FUNCTION "${schema}"."assistant_deletion_steps_are_valid"("steps" jsonb)
      RETURNS boolean
      LANGUAGE plpgsql
      IMMUTABLE
      STRICT
      AS $function$
      DECLARE
        "step_row" jsonb;
        "attempt_value" numeric;
        "field_name" text;
        "allowed_keys" text[];
      BEGIN
        IF jsonb_typeof("steps") <> 'array' THEN
          RETURN false;
        END IF;
        FOR "step_row" IN SELECT value FROM jsonb_array_elements("steps") LOOP
          IF jsonb_typeof("step_row") <> 'object'
            OR jsonb_typeof("step_row" -> 'attempt') IS DISTINCT FROM 'number'
            OR jsonb_typeof("step_row" -> 'completedAt') IS DISTINCT FROM 'string'
          THEN
            RETURN false;
          END IF;
          BEGIN
            "attempt_value" := ("step_row" ->> 'attempt')::numeric;
          EXCEPTION WHEN OTHERS THEN
            RETURN false;
          END;
          IF "attempt_value" < 1 OR "attempt_value" <> trunc("attempt_value") THEN
            RETURN false;
          END IF;
          IF NOT "${schema}"."assistant_is_valid_iso_datetime_with_offset"("step_row" ->> 'completedAt') THEN
            RETURN false;
          END IF;

          "allowed_keys" := ARRAY['step', 'attempt', 'completedAt', 'disposition'];
          IF "step_row" ->> 'disposition' = 'retryable_failure' THEN
            "allowed_keys" := "allowed_keys" || ARRAY['failureCode', 'cleanupReferenceId'];
            IF jsonb_typeof("step_row" -> 'failureCode') IS DISTINCT FROM 'string'
              OR ("step_row" ->> 'failureCode') !~ '^[A-Z][A-Z0-9_]{0,127}$'
              OR jsonb_typeof("step_row" -> 'cleanupReferenceId') IS DISTINCT FROM 'string'
              OR ("step_row" ->> 'cleanupReferenceId') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
            THEN
              RETURN false;
            END IF;
          ELSIF "step_row" ->> 'disposition' = 'permanent_failure' THEN
            "allowed_keys" := "allowed_keys" || ARRAY['failureCode'];
            IF jsonb_typeof("step_row" -> 'failureCode') IS DISTINCT FROM 'string'
              OR ("step_row" ->> 'failureCode') !~ '^[A-Z][A-Z0-9_]{0,127}$'
            THEN
              RETURN false;
            END IF;
          ELSIF "step_row" ->> 'disposition' = 'preserved' THEN
            "allowed_keys" := "allowed_keys" || ARRAY['reason'];
            IF "step_row" ->> 'step' = 'artifact_blobs' THEN
              "allowed_keys" := "allowed_keys" || ARRAY['remainingArtifactReferences'];
              IF jsonb_typeof("step_row" -> 'remainingArtifactReferences') IS DISTINCT FROM 'number'
                OR ("step_row" ->> 'remainingArtifactReferences')::numeric < 1
                OR ("step_row" ->> 'remainingArtifactReferences')::numeric <> trunc(("step_row" ->> 'remainingArtifactReferences')::numeric)
              THEN
                RETURN false;
              END IF;
            END IF;
          ELSIF "step_row" ->> 'disposition' = 'deleted' AND "step_row" ->> 'step' = 'artifact_blobs' THEN
            "allowed_keys" := "allowed_keys" || ARRAY['remainingArtifactReferences'];
          END IF;
          FOR "field_name" IN SELECT jsonb_object_keys("step_row") LOOP
            IF NOT ("field_name" = ANY("allowed_keys")) THEN
              RETURN false;
            END IF;
          END LOOP;
        END LOOP;
        RETURN true;
      END
      $function$
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_deletion_receipt" (
        "deletion_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "status" varchar(32) NOT NULL,
        "attempt" integer NOT NULL,
        "correlation_id" varchar(128) NOT NULL,
        "confirmation_hash" bytea NOT NULL,
        "steps" jsonb NOT NULL,
        "steps_sha256" bytea NOT NULL,
        "retry_cleanup_reference_id" varchar(128) NULL,
        "requested_at" timestamptz NOT NULL,
        "completed_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ck_assistant_deletion_receipt_identity" CHECK (char_length("deletion_id") > 0 AND char_length("owner_id") > 0 AND char_length("session_id") > 0 AND "attempt" > 0 AND char_length("correlation_id") > 0),
        CONSTRAINT "ck_assistant_deletion_receipt_versions" CHECK ("schema_version" = 1 AND "resource_version" >= 0),
        CONSTRAINT "ck_assistant_deletion_receipt_hashes" CHECK (octet_length("confirmation_hash") = 32 AND octet_length("steps_sha256") = 32),
        CONSTRAINT "ck_assistant_deletion_receipt_steps" CHECK (
          "${schema}"."assistant_deletion_steps_are_valid"("steps") AND jsonb_array_length("steps") = 11
          AND "steps" @? '$[*] ? (@.step == "postgres_session_data")'
          AND "steps" @? '$[*] ? (@.step == "checkpoint_tool_records")'
          AND "steps" @? '$[*] ? (@.step == "redis_projection")'
          AND "steps" @? '$[*] ? (@.step == "mem0_session")'
          AND "steps" @? '$[*] ? (@.step == "mem0_user_scope")'
          AND "steps" @? '$[*] ? (@.step == "artifact_references")'
          AND "steps" @? '$[*] ? (@.step == "artifact_blobs")'
          AND "steps" @? '$[*] ? (@.step == "mcp_credentials")'
          AND "steps" @? '$[*] ? (@.step == "binding_metadata")'
          AND "steps" @? '$[*] ? (@.step == "independent_forks")'
          AND "steps" @? '$[*] ? (@.step == "audit_minimization")'
          AND NOT "steps" @? '$[*] ? (!exists(@.attempt) || !exists(@.completedAt) || !exists(@.disposition))'
          AND NOT "steps" @? '$[*] ? (!(
            (@.step == "mem0_user_scope" && @.disposition == "preserved")
            || (@.step == "independent_forks" && @.disposition == "preserved")
            || (@.step == "artifact_blobs" && (@.disposition == "deleted" || @.disposition == "preserved" || @.disposition == "retryable_failure" || @.disposition == "permanent_failure"))
            || ((@.step == "postgres_session_data" || @.step == "checkpoint_tool_records" || @.step == "redis_projection" || @.step == "mem0_session" || @.step == "artifact_references" || @.step == "mcp_credentials" || @.step == "binding_metadata" || @.step == "audit_minimization") && (@.disposition == "deleted" || @.disposition == "retryable_failure" || @.disposition == "permanent_failure"))
          ))'
          AND NOT "steps" @? '$[*] ? (@.disposition == "deleted" && (exists(@.failureCode) || exists(@.cleanupReferenceId) || exists(@.reason)))'
          AND NOT "steps" @? '$[*] ? (@.disposition == "retryable_failure" && (!exists(@.failureCode) || !(@.failureCode like_regex "^[A-Z][A-Z0-9_]{0,127}$") || !exists(@.cleanupReferenceId)))'
          AND NOT "steps" @? '$[*] ? (@.disposition == "permanent_failure" && (!exists(@.failureCode) || !(@.failureCode like_regex "^[A-Z][A-Z0-9_]{0,127}$") || exists(@.cleanupReferenceId)))'
          AND "steps" @? '$[*] ? (@.step == "artifact_blobs" && ((@.disposition == "deleted" && @.remainingArtifactReferences == 0) || (@.disposition == "preserved" && @.reason == "shared_blob_reference" && @.remainingArtifactReferences > 0) || @.disposition == "retryable_failure" || @.disposition == "permanent_failure"))'
          AND "steps" @? '$[*] ? (@.step == "mem0_user_scope" && @.disposition == "preserved" && @.reason == "user_scoped_memory")'
          AND "steps" @? '$[*] ? (@.step == "independent_forks" && @.disposition == "preserved" && @.reason == "independent_fork")'
        ),
        CONSTRAINT "ck_assistant_deletion_receipt_status" CHECK ("status" IN ('completed', 'partial_failure', 'blocked_failure')),
        CONSTRAINT "ck_assistant_deletion_receipt_completion" CHECK (
          ("status" = 'completed' AND "retry_cleanup_reference_id" IS NULL AND NOT "steps" @? '$[*] ? (@.disposition == "retryable_failure" || @.disposition == "permanent_failure")')
          OR ("status" = 'partial_failure' AND "completed_at" IS NOT NULL AND "retry_cleanup_reference_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' AND "steps" @? '$[*] ? (@.disposition == "retryable_failure")' AND NOT "steps" @? '$[*] ? (@.disposition == "permanent_failure")' AND NOT jsonb_path_exists("steps", '$[*] ? (@.disposition == "retryable_failure" && @.cleanupReferenceId != $cleanup)', jsonb_build_object('cleanup', "retry_cleanup_reference_id")))
          OR ("status" = 'blocked_failure' AND "completed_at" IS NOT NULL AND "retry_cleanup_reference_id" IS NULL AND "steps" @? '$[*] ? (@.disposition == "permanent_failure")')
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_audit_record" (
        "audit_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NULL,
        "run_id" varchar(128) NULL,
        "tool_execution_row_id" bigint NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "actor_type" varchar(16) NOT NULL,
        "actor_id" varchar(128) NOT NULL,
        "action" varchar(32) NOT NULL,
        "target_type" varchar(32) NOT NULL,
        "target_id" varchar(128) NULL,
        "result_class" varchar(32) NOT NULL,
        "decision_kind" varchar(32) NOT NULL,
        "authorization_decision" varchar(16) NULL,
        "stale_owner_id" varchar(128) NULL,
        "current_owner_id" varchar(128) NULL,
        "stale_fencing_token" bigint NULL,
        "current_fencing_token" bigint NULL,
        "policy_id" varchar(128) NOT NULL,
        "policy_version" bigint NOT NULL,
        "correlation_id" varchar(128) NOT NULL,
        "request_id" varchar(128) NOT NULL,
        "reason_code" varchar(128) NOT NULL,
        "redacted_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata_sha256" bytea NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ck_assistant_audit_record_identity" CHECK (char_length("audit_id") > 0 AND char_length("owner_id") > 0 AND char_length("actor_id") > 0 AND char_length("policy_id") > 0 AND char_length("correlation_id") > 0 AND char_length("request_id") > 0),
        CONSTRAINT "ck_assistant_audit_record_version" CHECK ("schema_version" = 1 AND "policy_version" >= 0),
        CONSTRAINT "ck_assistant_audit_record_actor" CHECK ("actor_type" IN ('user', 'service', 'worker')),
        CONSTRAINT "ck_assistant_audit_record_action" CHECK ("action" IN ('admission', 'authorization', 'tool_execution', 'settings_change', 'fork', 'deletion', 'administrative_change', 'fenced_commit')),
        CONSTRAINT "ck_assistant_audit_record_target" CHECK ("target_type" IN ('session', 'run', 'tool_execution', 'settings', 'artifact', 'user', 'system')),
        CONSTRAINT "ck_assistant_audit_record_result" CHECK ("result_class" IN ('success', 'denied', 'failure', 'conflict', 'result_unknown')),
        CONSTRAINT "ck_assistant_audit_record_decision" CHECK (
          ("decision_kind" = 'authorization' AND "authorization_decision" IN ('allowed', 'denied') AND (("authorization_decision" = 'denied') = ("result_class" = 'denied')) AND "stale_owner_id" IS NULL AND "current_owner_id" IS NULL AND "stale_fencing_token" IS NULL AND "current_fencing_token" IS NULL)
          OR ("decision_kind" = 'operational' AND "authorization_decision" IS NULL AND "stale_owner_id" IS NULL AND "current_owner_id" IS NULL AND "stale_fencing_token" IS NULL AND "current_fencing_token" IS NULL)
          OR ("decision_kind" = 'stale_fence_rejected' AND "authorization_decision" IS NULL AND "action" = 'fenced_commit' AND "result_class" = 'denied' AND "stale_owner_id" IS NOT NULL AND "current_owner_id" IS NOT NULL AND "stale_owner_id" <> "current_owner_id" AND "stale_fencing_token" IS NOT NULL AND "current_fencing_token" IS NOT NULL AND "stale_fencing_token" >= 0 AND "current_fencing_token" > "stale_fencing_token")
        ),
        CONSTRAINT "ck_assistant_audit_record_reason" CHECK ("reason_code" ~ '^[A-Z][A-Z0-9_]{0,127}$'),
        CONSTRAINT "ck_assistant_audit_record_metadata" CHECK (jsonb_typeof("redacted_metadata") = 'object' AND octet_length("metadata_sha256") = 32)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();

    // 严格按外键反向依赖删除；4.1 的七张核心表保持不变。
    for (const table of [
      'assistant_audit_record',
      'assistant_deletion_receipt',
      'assistant_memory_operation_source',
      'assistant_memory_operation',
      'assistant_context_snapshot',
      'assistant_artifact_reference',
      'assistant_artifact',
      'assistant_interrupt',
      'assistant_tool_execution',
      'assistant_compaction',
      'assistant_checkpoint',
      'assistant_outbox',
      'assistant_event',
      'assistant_client_binding',
      'assistant_mcp_connection',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."${table}"`);
    }
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "${schema}"."assistant_deletion_steps_are_valid"(jsonb)`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "${schema}"."assistant_is_valid_iso_datetime_with_offset"(text)`,
    );
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_turn"
        DROP CONSTRAINT IF EXISTS "uq_assistant_turn_run_owner"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_run"
        DROP CONSTRAINT IF EXISTS "uq_assistant_run_session_owner"
    `);
  }
}
