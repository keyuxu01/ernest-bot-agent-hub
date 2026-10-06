import type { MigrationInterface, QueryRunner } from 'typeorm';
import { validatePostgresSchemaName } from '../../../config/environment';

const schemaName = (): string =>
  validatePostgresSchemaName(process.env.POSTGRES_SCHEMA ?? 'assistant_runtime');

/**
 * 面向产品热路径的索引。部分索引只保留待处理行，避免完成历史持续放大 worker 扫描成本。
 */
export class AddRuntimeQueryIndexes1791177960000 implements MigrationInterface {
  readonly name = 'AddRuntimeQueryIndexes1791177960000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    await queryRunner.query(`
      CREATE INDEX "ix_assistant_session_catalog"
        ON "${schema}"."assistant_session"
        ("owner_id", "lifecycle_state", "updated_at" DESC, "session_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_assistant_run_active"
        ON "${schema}"."assistant_run"
        ("owner_id", "state", "updated_at", "run_id")
        WHERE "state" NOT IN ('Succeeded', 'Failed', 'Cancelled', 'ResultUnknown')
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_assistant_binding_expired_lease"
        ON "${schema}"."assistant_client_binding"
        ("lease_expires_at", "owner_id", "binding_id")
        WHERE "lifecycle_state" = 'Active'
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_assistant_tool_pending"
        ON "${schema}"."assistant_tool_execution"
        ("owner_id", "state", "created_at", "execution_row_id")
        WHERE "state" IN ('Pending', 'Dispatched', 'Acknowledged')
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_assistant_interrupt_pending"
        ON "${schema}"."assistant_interrupt"
        ("owner_id", "created_at", "interrupt_id")
        WHERE "state" = 'Pending'
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_assistant_outbox_ready"
        ON "${schema}"."assistant_outbox"
        ("available_at", "outbox_row_id")
        WHERE "state" IN ('Pending', 'RetryableFailure')
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_assistant_outbox_stale_claim"
        ON "${schema}"."assistant_outbox"
        ("claimed_at", "outbox_row_id")
        WHERE "state" = 'Claimed'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    for (const index of [
      'ix_assistant_outbox_stale_claim',
      'ix_assistant_outbox_ready',
      'ix_assistant_interrupt_pending',
      'ix_assistant_tool_pending',
      'ix_assistant_binding_expired_lease',
      'ix_assistant_run_active',
      'ix_assistant_session_catalog',
    ]) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."${index}"`);
    }
  }
}
