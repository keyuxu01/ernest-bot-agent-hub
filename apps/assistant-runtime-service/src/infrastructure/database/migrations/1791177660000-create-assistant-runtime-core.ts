import type { MigrationInterface, QueryRunner } from 'typeorm';
import { validatePostgresSchemaName } from '../../../config/environment';

const schemaName = (): string =>
  validatePostgresSchemaName(process.env.POSTGRES_SCHEMA ?? 'assistant_runtime');

/**
 * Assistant Runtime 的第一版耐久核心。
 * 本迁移只建立 4.1 的聚合骨架；事件、工具、checkpoint、业务唯一索引由后续任务补齐。
 */
export class CreateAssistantRuntimeCore1791177660000 implements MigrationInterface {
  readonly name = 'CreateAssistantRuntimeCore1791177660000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_session" (
        "session_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "title" varchar(256) NOT NULL,
        "lifecycle_state" varchar(32) NOT NULL DEFAULT 'Active',
        "archived_at" timestamptz NULL,
        "deletion_requested_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ck_assistant_session_identity" CHECK (char_length("session_id") > 0 AND char_length("owner_id") > 0),
        CONSTRAINT "uq_assistant_session_owner" UNIQUE ("session_id", "owner_id"),
        CONSTRAINT "ck_assistant_session_schema_version" CHECK ("schema_version" = 1),
        CONSTRAINT "ck_assistant_session_resource_version" CHECK ("resource_version" >= 0),
        CONSTRAINT "ck_assistant_session_title" CHECK (char_length(btrim("title")) > 0),
        CONSTRAINT "ck_assistant_session_lifecycle" CHECK ("lifecycle_state" IN ('Active', 'Archived', 'DeletionPending')),
        CONSTRAINT "ck_assistant_session_lifecycle_time" CHECK (
          ("lifecycle_state" = 'Active' AND "archived_at" IS NULL AND "deletion_requested_at" IS NULL)
          OR ("lifecycle_state" = 'Archived' AND "archived_at" IS NOT NULL AND "deletion_requested_at" IS NULL)
          OR ("lifecycle_state" = 'DeletionPending' AND "deletion_requested_at" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_settings" (
        "settings_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "scope_kind" varchar(16) NOT NULL,
        "session_id" varchar(128) NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "provider_connection_id" varchar(128) NULL,
        "model" varchar(256) NULL,
        "reasoning_effort" varchar(64) NULL,
        "service_tier" varchar(64) NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ck_assistant_settings_identity" CHECK (char_length("settings_id") > 0 AND char_length("owner_id") > 0),
        CONSTRAINT "fk_assistant_settings_session_owner"
          FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_settings_scope" CHECK (
          ("scope_kind" = 'User' AND "session_id" IS NULL)
          OR (
            "scope_kind" = 'Session'
            AND "session_id" IS NOT NULL
            AND "provider_connection_id" IS NOT NULL
            AND char_length("provider_connection_id") > 0
            AND "model" IS NOT NULL
            AND char_length(btrim("model")) > 0
          )
        ),
        CONSTRAINT "ck_assistant_settings_schema_version" CHECK ("schema_version" = 1),
        CONSTRAINT "ck_assistant_settings_resource_version" CHECK ("resource_version" >= 0),
        CONSTRAINT "ck_assistant_settings_model" CHECK ("model" IS NULL OR char_length(btrim("model")) > 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_command" (
        "command_row_id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "command_id" varchar(128) NOT NULL,
        "session_id" varchar(128) NULL,
        "command_type" varchar(64) NOT NULL,
        "request_schema_version" smallint NOT NULL DEFAULT 1,
        "request_hash" bytea NOT NULL,
        "expected_resource_version" bigint NULL,
        "correlation_id" varchar(128) NOT NULL,
        "state" varchar(32) NOT NULL DEFAULT 'Accepted',
        "result_resource_type" varchar(64) NULL,
        "result_resource_id" varchar(128) NULL,
        "result_resource_version" bigint NULL,
        "error_code" varchar(128) NULL,
        "accepted_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ck_assistant_command_identity" CHECK (char_length("owner_id") > 0 AND char_length("command_id") > 0 AND char_length("correlation_id") > 0),
        CONSTRAINT "uq_assistant_command_owner_row" UNIQUE ("command_row_id", "owner_id"),
        CONSTRAINT "fk_assistant_command_session_owner"
          FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_command_type" CHECK ("command_type" IN ('create_session', 'rename', 'archive', 'unarchive', 'delete', 'start_run', 'steer', 'stop', 'retry', 'update_settings', 'compact', 'fork', 'revert', 'revert_and_edit')),
        CONSTRAINT "ck_assistant_command_schema_version" CHECK ("request_schema_version" = 1),
        CONSTRAINT "ck_assistant_command_hash" CHECK (octet_length("request_hash") = 32),
        CONSTRAINT "ck_assistant_command_expected_version" CHECK ("expected_resource_version" IS NULL OR "expected_resource_version" >= 0),
        CONSTRAINT "ck_assistant_command_result_version" CHECK ("result_resource_version" IS NULL OR "result_resource_version" >= 0),
        CONSTRAINT "ck_assistant_command_state" CHECK ("state" IN ('Accepted', 'Completed', 'Failed', 'ResultUnknown')),
        CONSTRAINT "ck_assistant_command_completion" CHECK (
          ("state" = 'Accepted' AND "completed_at" IS NULL)
          OR ("state" <> 'Accepted' AND "completed_at" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_run" (
        "run_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "schema_version" smallint NOT NULL DEFAULT 1,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "state" varchar(32) NOT NULL,
        "fencing_epoch" bigint NOT NULL DEFAULT 0,
        "next_steer_ordinal" bigint NOT NULL DEFAULT 0,
        "settings_version" bigint NOT NULL,
        "provider_connection_id" varchar(128) NOT NULL,
        "model" varchar(256) NOT NULL,
        "reasoning_effort" varchar(64) NULL,
        "service_tier" varchar(64) NULL,
        "terminal_reason_code" varchar(128) NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "started_at" timestamptz NULL,
        "finished_at" timestamptz NULL,
        CONSTRAINT "ck_assistant_run_identity" CHECK (char_length("run_id") > 0 AND char_length("owner_id") > 0 AND char_length("session_id") > 0 AND char_length("provider_connection_id") > 0 AND char_length(btrim("model")) > 0),
        CONSTRAINT "uq_assistant_run_owner" UNIQUE ("run_id", "owner_id"),
        CONSTRAINT "fk_assistant_run_session_owner"
          FOREIGN KEY ("session_id", "owner_id") REFERENCES "${schema}"."assistant_session" ("session_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_run_schema_version" CHECK ("schema_version" = 1),
        CONSTRAINT "ck_assistant_run_versions" CHECK ("resource_version" >= 0 AND "settings_version" >= 0),
        CONSTRAINT "ck_assistant_run_ordinals" CHECK ("fencing_epoch" >= 0 AND "next_steer_ordinal" >= 0),
        CONSTRAINT "ck_assistant_run_state" CHECK ("state" IN ('Queued', 'Running', 'WaitingForLocalTool', 'WaitingForMcpTool', 'WaitingForHuman', 'Compacting', 'Cancelling', 'Succeeded', 'Failed', 'Cancelled', 'ResultUnknown')),
        CONSTRAINT "ck_assistant_run_terminal_time" CHECK (
          (("state" IN ('Succeeded', 'Failed', 'Cancelled', 'ResultUnknown')) AND "finished_at" IS NOT NULL)
          OR (("state" NOT IN ('Succeeded', 'Failed', 'Cancelled', 'ResultUnknown')) AND "finished_at" IS NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_turn" (
        "turn_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "run_id" varchar(128) NOT NULL,
        "ordinal" bigint NOT NULL,
        "input_event_sequence" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" timestamptz NULL,
        CONSTRAINT "ck_assistant_turn_identity" CHECK (char_length("turn_id") > 0 AND char_length("owner_id") > 0 AND char_length("run_id") > 0),
        CONSTRAINT "uq_assistant_turn_owner" UNIQUE ("turn_id", "owner_id"),
        CONSTRAINT "fk_assistant_turn_run_owner"
          FOREIGN KEY ("run_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_turn_ordinals" CHECK ("ordinal" >= 0 AND "input_event_sequence" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_model_attempt" (
        "attempt_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "turn_id" varchar(128) NOT NULL,
        "ordinal" bigint NOT NULL,
        "attempt_state" varchar(32) NOT NULL,
        "outcome" varchar(32) NULL,
        "retry_budget_consumed" boolean NOT NULL DEFAULT false,
        "provider_correlation_id" varchar(256) NULL,
        "usage_availability" varchar(32) NOT NULL DEFAULT 'unavailable',
        "input_tokens" bigint NULL,
        "output_tokens" bigint NULL,
        "reasoning_tokens" bigint NULL,
        "cached_tokens" bigint NULL,
        "total_tokens" bigint NULL,
        "cost" numeric(20, 8) NULL,
        "price_version" varchar(128) NULL,
        "provider_timestamp" timestamptz NULL,
        "started_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "finished_at" timestamptz NULL,
        CONSTRAINT "ck_assistant_model_attempt_identity" CHECK (char_length("attempt_id") > 0 AND char_length("owner_id") > 0 AND char_length("turn_id") > 0),
        CONSTRAINT "uq_assistant_model_attempt_owner" UNIQUE ("attempt_id", "owner_id"),
        CONSTRAINT "fk_assistant_model_attempt_turn_owner"
          FOREIGN KEY ("turn_id", "owner_id") REFERENCES "${schema}"."assistant_turn" ("turn_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_model_attempt_ordinal" CHECK ("ordinal" >= 0),
        CONSTRAINT "ck_assistant_model_attempt_state" CHECK ("attempt_state" IN ('Started', 'Finished', 'ResultUnknown')),
        CONSTRAINT "ck_assistant_model_attempt_outcome" CHECK ("outcome" IS NULL OR "outcome" IN ('continuation', 'completed', 'retryable_failure', 'tool_failure', 'permanent_failure')),
        CONSTRAINT "ck_assistant_model_attempt_completion" CHECK (
          ("attempt_state" = 'Started' AND "outcome" IS NULL AND "finished_at" IS NULL)
          OR ("attempt_state" = 'Finished' AND "outcome" IS NOT NULL AND "finished_at" IS NOT NULL)
          OR ("attempt_state" = 'ResultUnknown' AND "outcome" IS NULL AND "finished_at" IS NOT NULL)
        ),
        CONSTRAINT "ck_assistant_model_attempt_retry_budget" CHECK ("outcome" <> 'continuation' OR NOT "retry_budget_consumed"),
        CONSTRAINT "ck_assistant_model_attempt_usage_kind" CHECK ("usage_availability" IN ('provider_reported', 'estimated', 'unavailable')),
        CONSTRAINT "ck_assistant_model_attempt_usage" CHECK (
          ("usage_availability" = 'unavailable' AND "input_tokens" IS NULL AND "output_tokens" IS NULL AND "reasoning_tokens" IS NULL AND "cached_tokens" IS NULL AND "total_tokens" IS NULL AND "cost" IS NULL AND "price_version" IS NULL AND "provider_timestamp" IS NULL)
          OR ("usage_availability" IN ('provider_reported', 'estimated') AND "input_tokens" IS NOT NULL AND "output_tokens" IS NOT NULL AND "total_tokens" IS NOT NULL AND "input_tokens" >= 0 AND "output_tokens" >= 0 AND "total_tokens" >= 0 AND coalesce("reasoning_tokens", 0) >= 0 AND coalesce("cached_tokens", 0) >= 0 AND ("cost" IS NULL OR "cost" >= 0))
        ),
        CONSTRAINT "ck_assistant_model_attempt_provider_time" CHECK ("usage_availability" <> 'provider_reported' OR "provider_timestamp" IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_steer_command" (
        "steer_id" varchar(128) PRIMARY KEY,
        "owner_id" varchar(256) NOT NULL,
        "run_id" varchar(128) NOT NULL,
        "source_command_row_id" bigint NOT NULL,
        "accepted_ordinal" bigint NOT NULL,
        "input_text" text NOT NULL,
        "state" varchar(32) NOT NULL DEFAULT 'Pending',
        "claimed_by_attempt_id" varchar(128) NULL,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "accepted_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "claimed_at" timestamptz NULL,
        "consumed_at" timestamptz NULL,
        CONSTRAINT "ck_assistant_steer_identity" CHECK (char_length("steer_id") > 0 AND char_length("owner_id") > 0 AND char_length("run_id") > 0),
        CONSTRAINT "fk_assistant_steer_run_owner"
          FOREIGN KEY ("run_id", "owner_id") REFERENCES "${schema}"."assistant_run" ("run_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_steer_command_owner"
          FOREIGN KEY ("source_command_row_id", "owner_id") REFERENCES "${schema}"."assistant_command" ("command_row_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_assistant_steer_attempt_owner"
          FOREIGN KEY ("claimed_by_attempt_id", "owner_id") REFERENCES "${schema}"."assistant_model_attempt" ("attempt_id", "owner_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_steer_ordinal_version" CHECK ("accepted_ordinal" >= 0 AND "resource_version" >= 0),
        CONSTRAINT "ck_assistant_steer_input" CHECK (char_length("input_text") BETWEEN 1 AND 1048576),
        CONSTRAINT "ck_assistant_steer_state" CHECK ("state" IN ('Pending', 'Claimed', 'Consumed', 'Cancelled')),
        CONSTRAINT "ck_assistant_steer_state_time" CHECK (
          ("state" = 'Pending' AND "claimed_at" IS NULL AND "consumed_at" IS NULL AND "claimed_by_attempt_id" IS NULL)
          OR ("state" = 'Claimed' AND "claimed_at" IS NOT NULL AND "consumed_at" IS NULL AND "claimed_by_attempt_id" IS NOT NULL)
          OR ("state" = 'Consumed' AND "claimed_at" IS NOT NULL AND "consumed_at" IS NOT NULL AND "claimed_by_attempt_id" IS NOT NULL)
          OR ("state" = 'Cancelled' AND "consumed_at" IS NOT NULL)
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    for (const table of [
      'assistant_steer_command',
      'assistant_model_attempt',
      'assistant_turn',
      'assistant_run',
      'assistant_command',
      'assistant_settings',
      'assistant_session',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."${table}"`);
    }
  }
}
