import type { MigrationInterface, QueryRunner } from 'typeorm';
import { validatePostgresSchemaName } from '../../../config/environment';

const schemaName = (): string =>
  validatePostgresSchemaName(process.env.POSTGRES_SCHEMA ?? 'assistant_runtime');

/**
 * 4.3 的产品唯一性边界。
 * 这里只阻止互相冲突的耐久事实；连续序列、CAS 与 fencing 单调性仍由后续事务层负责。
 */
export class AddAssistantRuntimeProductUniqueness1791177840000 implements MigrationInterface {
  readonly name = 'AddAssistantRuntimeProductUniqueness1791177840000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_command"
        ADD CONSTRAINT "uq_assistant_command_owner_command" UNIQUE ("owner_id", "command_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_event"
        ADD CONSTRAINT "uq_assistant_event_session_sequence" UNIQUE ("session_id", "sequence"),
        ADD CONSTRAINT "uq_assistant_event_event_id" UNIQUE ("event_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_assistant_run_one_active_per_session"
        ON "${schema}"."assistant_run" ("session_id")
        WHERE "state" IN ('Queued', 'Running', 'WaitingForLocalTool', 'WaitingForMcpTool', 'WaitingForHuman', 'Compacting', 'Cancelling')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_assistant_tool_execution_terminal_attempt"
        ON "${schema}"."assistant_tool_execution" ("owner_id", "execution_id", "attempt")
        WHERE "state" IN ('Completed', 'Failed', 'Cancelled', 'ResultUnknown', 'Rejected', 'Conflict')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_assistant_interrupt_resolution_command"
        ON "${schema}"."assistant_interrupt" ("owner_id", "resolution_command_id")
        WHERE "state" IN ('Answered', 'Approved', 'Rejected', 'Cancelled')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_assistant_interrupt_resolution_idempotency"
        ON "${schema}"."assistant_interrupt" ("owner_id", "resolution_idempotency_key")
        WHERE "state" IN ('Answered', 'Approved', 'Rejected', 'Cancelled')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_assistant_client_binding_current_epoch"
        ON "${schema}"."assistant_client_binding" ("owner_id", "cli_instance_id", "workspace_id")
        WHERE "lifecycle_state" IN ('Active', 'Offline')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    for (const index of [
      'uq_assistant_client_binding_current_epoch',
      'uq_assistant_interrupt_resolution_idempotency',
      'uq_assistant_interrupt_resolution_command',
      'uq_assistant_tool_execution_terminal_attempt',
      'uq_assistant_run_one_active_per_session',
    ]) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${schema}"."${index}"`);
    }
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_event"
        DROP CONSTRAINT IF EXISTS "uq_assistant_event_event_id",
        DROP CONSTRAINT IF EXISTS "uq_assistant_event_session_sequence"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_command"
        DROP CONSTRAINT IF EXISTS "uq_assistant_command_owner_command"
    `);
  }
}
