import type { MigrationInterface, QueryRunner } from 'typeorm';
import { validatePostgresSchemaName } from '../../../config/environment';

const schemaName = (): string =>
  validatePostgresSchemaName(process.env.POSTGRES_SCHEMA ?? 'assistant_runtime');

/**
 * 4.5 的原子提交状态。
 * allocator 与 active head 必须分开：后续 revert 可以移动 head，但不能复用已经提交的序号。
 */
export class AddAtomicSessionCommitState1791177900000 implements MigrationInterface {
  readonly name = 'AddAtomicSessionCommitState1791177900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    const invalidHistories = (await queryRunner.query(`
      SELECT "session_id"
      FROM "${schema}"."assistant_event"
      GROUP BY "session_id"
      HAVING min("sequence") <> 1 OR count(*) <> max("sequence")
      LIMIT 1
    `)) as unknown[];
    if (invalidHistories.length > 0) {
      throw new Error(
        'Cannot add Session allocator: existing event history is not contiguous from sequence 1',
      );
    }
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_session"
        ADD COLUMN "next_event_sequence" bigint NOT NULL DEFAULT 1,
        ADD COLUMN "active_head_sequence" bigint NULL
    `);
    await queryRunner.query(`
      UPDATE "${schema}"."assistant_session" AS session
      SET
        "next_event_sequence" = event_state.next_sequence,
        "active_head_sequence" = event_state.active_head
      FROM (
        SELECT
          session_row."session_id",
          coalesce(max(event."sequence") + 1, 1) AS next_sequence,
          max(event."sequence") AS active_head
        FROM "${schema}"."assistant_session" AS session_row
        LEFT JOIN "${schema}"."assistant_event" AS event
          ON event."session_id" = session_row."session_id"
         AND event."owner_id" = session_row."owner_id"
        GROUP BY session_row."session_id"
      ) AS event_state
      WHERE session."session_id" = event_state."session_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_session"
        ADD CONSTRAINT "ck_assistant_session_event_sequences"
        CHECK (
          "next_event_sequence" >= 1
          AND ("active_head_sequence" IS NULL OR (
            "active_head_sequence" >= 0
            AND "active_head_sequence" < "next_event_sequence"
          ))
        )
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_event"
        ADD CONSTRAINT "uq_assistant_event_session_sequence_owner"
        UNIQUE ("session_id", "sequence", "owner_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_session"
        ADD CONSTRAINT "fk_assistant_session_active_head"
        FOREIGN KEY ("session_id", "active_head_sequence", "owner_id")
        REFERENCES "${schema}"."assistant_event"
          ("session_id", "sequence", "owner_id")
        ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_run"
        ADD COLUMN "current_checkpoint_id" varchar(128) NULL,
        ADD CONSTRAINT "fk_assistant_run_current_checkpoint_lineage"
          FOREIGN KEY ("current_checkpoint_id", "run_id", "session_id", "owner_id")
          REFERENCES "${schema}"."assistant_checkpoint"
            ("checkpoint_id", "run_id", "session_id", "owner_id")
          ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_outbox"
        ADD CONSTRAINT "uq_assistant_outbox_topic_aggregate_sequence"
        UNIQUE ("topic", "aggregate_type", "aggregate_id", "aggregate_sequence")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_outbox"
        DROP CONSTRAINT IF EXISTS "uq_assistant_outbox_topic_aggregate_sequence"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_run"
        DROP CONSTRAINT IF EXISTS "fk_assistant_run_current_checkpoint_lineage",
        DROP COLUMN IF EXISTS "current_checkpoint_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_session"
        DROP CONSTRAINT IF EXISTS "fk_assistant_session_active_head",
        DROP CONSTRAINT IF EXISTS "ck_assistant_session_event_sequences",
        DROP COLUMN IF EXISTS "active_head_sequence",
        DROP COLUMN IF EXISTS "next_event_sequence"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_event"
        DROP CONSTRAINT IF EXISTS "uq_assistant_event_session_sequence_owner"
    `);
  }
}
