import type { MigrationInterface, QueryRunner } from 'typeorm';
import { validatePostgresSchemaName } from '../../../config/environment';

const schemaName = (): string =>
  validatePostgresSchemaName(process.env.POSTGRES_SCHEMA ?? 'user_platform');

/** Google sub 是稳定且不可复用的外部身份；禁用用户仍保留唯一占位。 */
export class AddAssistantUserProductUniqueness1791177780000 implements MigrationInterface {
  readonly name = 'AddAssistantUserProductUniqueness1791177780000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_user"
        ADD CONSTRAINT "uq_assistant_user_google_subject" UNIQUE ("google_subject")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    await queryRunner.query(`
      ALTER TABLE "${schema}"."assistant_user"
        DROP CONSTRAINT IF EXISTS "uq_assistant_user_google_subject"
    `);
  }
}
