import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CreateAssistantRuntimeCore1791177660000 } from '../../src/infrastructure/database/migrations/1791177660000-create-assistant-runtime-core';
import { CreateAssistantRuntimeExtensions1791177720000 } from '../../src/infrastructure/database/migrations/1791177720000-create-assistant-runtime-extensions';
import { AddAssistantRuntimeProductUniqueness1791177840000 } from '../../src/infrastructure/database/migrations/1791177840000-add-assistant-runtime-product-uniqueness';
import { AddAtomicSessionCommitState1791177900000 } from '../../src/infrastructure/database/migrations/1791177900000-add-atomic-session-commit-state';
import { AddRuntimeQueryIndexes1791177960000 } from '../../src/infrastructure/database/migrations/1791177960000-add-runtime-query-indexes';
import { PostgresAssistantRuntimePersistence } from '../../src/infrastructure/database/postgres/postgres-assistant-runtime-persistence';
import type { RecordAssistantCommandInput } from '../../src/modules/assistant/application/ports/assistant-runtime-command.port';

const schema = process.env.POSTGRES_SCHEMA;
if (typeof schema !== 'string' || !schema.endsWith('_test')) {
  throw new Error(
    'POSTGRES_SCHEMA must end with _test for destructive command integration tests',
  );
}

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  ssl: process.env.POSTGRES_SSL === 'true',
  synchronize: false,
  migrationsRun: false,
  migrationsTableName: 'assistant_runtime_command_test_migrations',
  migrations: [
    CreateAssistantRuntimeCore1791177660000,
    CreateAssistantRuntimeExtensions1791177720000,
    AddAssistantRuntimeProductUniqueness1791177840000,
    AddAtomicSessionCommitState1791177900000,
    AddRuntimeQueryIndexes1791177960000,
  ],
});

const commandInput = (
  overrides: Partial<RecordAssistantCommandInput> = {},
): RecordAssistantCommandInput => ({
  ownerId: 'owner-a',
  commandId: 'command-a',
  sessionId: 'session-a',
  commandType: 'rename',
  requestHash: Buffer.alloc(32, 1),
  expectedResourceVersion: 0,
  correlationId: 'correlation-a',
  ...overrides,
});

describe.sequential('idempotent Assistant command recording', () => {
  let persistence: PostgresAssistantRuntimePersistence;

  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.query(
      'DROP TABLE IF EXISTS "assistant_runtime_command_test_migrations"',
    );
    await dataSource.runMigrations();
    persistence = new PostgresAssistantRuntimePersistence(dataSource, schema);
  });

  beforeEach(async () => {
    await dataSource.query(`
      TRUNCATE TABLE "${schema}"."assistant_command", "${schema}"."assistant_session"
      CASCADE
    `);
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_session" (session_id, owner_id, title)
       VALUES ('session-a', 'owner-a', 'A'), ('session-b', 'owner-b', 'B')`,
    );
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.query(
        'DROP TABLE IF EXISTS "assistant_runtime_command_test_migrations"',
      );
      await dataSource.destroy();
    }
  });

  it('returns the durable record for an identical retry', async () => {
    const accepted = await persistence.recordCommand(commandInput());
    const replayed = await persistence.recordCommand(commandInput());

    expect(accepted).toMatchObject({
      outcome: 'accepted',
      command: { commandId: 'command-a', state: 'Accepted' },
    });
    expect(replayed).toEqual({
      outcome: 'replayed',
      command: accepted.outcome === 'accepted' ? accepted.command : undefined,
    });
  });

  it('returns request_conflict when a command ID is reused with another hash', async () => {
    await persistence.recordCommand(commandInput());

    await expect(
      persistence.recordCommand(commandInput({ requestHash: Buffer.alloc(32, 2) })),
    ).resolves.toEqual({ outcome: 'request_conflict' });

    const rows = (await dataSource.query(
      `SELECT count(*) FROM "${schema}"."assistant_command"
       WHERE owner_id = 'owner-a' AND command_id = 'command-a'`,
    )) as Array<{ count: string }>;
    expect(rows[0]?.count).toBe('1');
  });

  it('returns the recorded terminal outcome after the original command completes', async () => {
    await persistence.recordCommand(commandInput());
    await dataSource.query(
      `UPDATE "${schema}"."assistant_command"
       SET state = 'Completed', result_resource_type = 'session',
           result_resource_id = 'session-a', result_resource_version = 1,
           completed_at = CURRENT_TIMESTAMP
       WHERE owner_id = 'owner-a' AND command_id = 'command-a'`,
    );

    await expect(persistence.recordCommand(commandInput())).resolves.toMatchObject({
      outcome: 'replayed',
      command: {
        state: 'Completed',
        resultResourceType: 'session',
        resultResourceId: 'session-a',
        resultResourceVersion: 1,
      },
    });
  });

  it('serializes concurrent identical submissions into one accepted command', async () => {
    const results = await Promise.all(
      Array.from({ length: 24 }, () => persistence.recordCommand(commandInput())),
    );

    expect(results.filter(result => result.outcome === 'accepted')).toHaveLength(1);
    expect(results.filter(result => result.outcome === 'replayed')).toHaveLength(23);
    const rowIds = new Set(
      results.flatMap(result =>
        result.outcome === 'request_conflict' ? [] : [result.command.commandRowId],
      ),
    );
    expect(rowIds.size).toBe(1);
  });

  it('scopes the same command ID independently per owner', async () => {
    const [ownerA, ownerB] = await Promise.all([
      persistence.recordCommand(commandInput()),
      persistence.recordCommand(
        commandInput({ ownerId: 'owner-b', sessionId: 'session-b' }),
      ),
    ]);

    expect(ownerA.outcome).toBe('accepted');
    expect(ownerB.outcome).toBe('accepted');
  });

  it('rejects a request hash that is not SHA-256 length', async () => {
    await expect(
      persistence.recordCommand(commandInput({ requestHash: Buffer.alloc(31) })),
    ).rejects.toThrow('requestHash must contain exactly 32 bytes');
  });
});
