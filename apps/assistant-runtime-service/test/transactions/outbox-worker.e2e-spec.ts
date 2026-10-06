import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CreateAssistantRuntimeCore1791177660000 } from '../../src/infrastructure/database/migrations/1791177660000-create-assistant-runtime-core';
import { CreateAssistantRuntimeExtensions1791177720000 } from '../../src/infrastructure/database/migrations/1791177720000-create-assistant-runtime-extensions';
import { AddAssistantRuntimeProductUniqueness1791177840000 } from '../../src/infrastructure/database/migrations/1791177840000-add-assistant-runtime-product-uniqueness';
import { AddAtomicSessionCommitState1791177900000 } from '../../src/infrastructure/database/migrations/1791177900000-add-atomic-session-commit-state';
import { AddRuntimeQueryIndexes1791177960000 } from '../../src/infrastructure/database/migrations/1791177960000-add-runtime-query-indexes';
import { PostgresAssistantRuntimePersistence } from '../../src/infrastructure/database/postgres/postgres-assistant-runtime-persistence';

const schema = process.env.POSTGRES_SCHEMA;
if (typeof schema !== 'string' || !schema.endsWith('_test')) {
  throw new Error(
    'POSTGRES_SCHEMA must end with _test for destructive outbox integration tests',
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
  migrationsTableName: 'assistant_runtime_outbox_test_migrations',
  migrations: [
    CreateAssistantRuntimeCore1791177660000,
    CreateAssistantRuntimeExtensions1791177720000,
    AddAssistantRuntimeProductUniqueness1791177840000,
    AddAtomicSessionCommitState1791177900000,
    AddRuntimeQueryIndexes1791177960000,
  ],
});

const now = new Date('2026-10-05T12:00:00.000Z');

describe.sequential('Assistant outbox worker persistence', () => {
  let persistence: PostgresAssistantRuntimePersistence;

  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.query(
      'DROP TABLE IF EXISTS "assistant_runtime_outbox_test_migrations"',
    );
    await dataSource.runMigrations();
    persistence = new PostgresAssistantRuntimePersistence(dataSource, schema);
  });

  beforeEach(async () => {
    await dataSource.query(`
      TRUNCATE TABLE "${schema}"."assistant_outbox", "${schema}"."assistant_session"
      CASCADE
    `);
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_session" (session_id, owner_id, title)
       VALUES ('session-a', 'owner-a', 'A')`,
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_outbox"
       (owner_id, session_id, topic, aggregate_type, aggregate_id,
        aggregate_sequence, payload, payload_sha256, available_at)
       VALUES ('owner-a', 'session-a', 'assistant.event', 'session', 'session-a',
        1, '{"eventId":"event-a"}'::jsonb, $1, $2)`,
      [Buffer.alloc(32, 1), now],
    );
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.query(
        'DROP TABLE IF EXISTS "assistant_runtime_outbox_test_migrations"',
      );
      await dataSource.destroy();
    }
  });

  it('claims due work and completes it only for the claiming worker', async () => {
    const [work] = await persistence.claimOutbox({
      workerId: 'worker-a',
      limit: 10,
      now,
      claimTimeoutMs: 30_000,
    });
    expect(work).toMatchObject({ attemptCount: 1, claimedBy: 'worker-a' });
    await expect(
      persistence.completeOutbox({
        outboxRowId: work!.outboxRowId,
        workerId: 'worker-b',
        now,
      }),
    ).resolves.toEqual({ outcome: 'not_claim_owner_or_terminal' });
    await expect(
      persistence.completeOutbox({
        outboxRowId: work!.outboxRowId,
        workerId: 'worker-a',
        now,
      }),
    ).resolves.toEqual({ outcome: 'updated' });
  });

  it('reclaims a timed-out claim with the same stable delivery key', async () => {
    const [first] = await persistence.claimOutbox({
      workerId: 'worker-crashed',
      limit: 1,
      now,
      claimTimeoutMs: 30_000,
    });
    const tooEarly = await persistence.claimOutbox({
      workerId: 'worker-recovery',
      limit: 1,
      now: new Date(now.getTime() + 29_999),
      claimTimeoutMs: 30_000,
    });
    expect(tooEarly).toEqual([]);

    const [recovered] = await persistence.claimOutbox({
      workerId: 'worker-recovery',
      limit: 1,
      now: new Date(now.getTime() + 30_000),
      claimTimeoutMs: 30_000,
    });
    expect(recovered).toMatchObject({
      outboxRowId: first!.outboxRowId,
      deliveryKey: first!.deliveryKey,
      attemptCount: 2,
      claimedBy: 'worker-recovery',
    });
    await expect(
      persistence.completeOutbox({
        outboxRowId: first!.outboxRowId,
        workerId: 'worker-crashed',
        now: new Date(now.getTime() + 30_001),
      }),
    ).resolves.toEqual({ outcome: 'not_claim_owner_or_terminal' });
  });

  it('schedules retryable work and does not claim it before availableAt', async () => {
    const [work] = await persistence.claimOutbox({
      workerId: 'worker-a',
      limit: 1,
      now,
      claimTimeoutMs: 30_000,
    });
    const availableAt = new Date(now.getTime() + 60_000);
    await expect(
      persistence.retryOutbox({
        outboxRowId: work!.outboxRowId,
        workerId: 'worker-a',
        now,
        availableAt,
        errorCode: 'redis_unavailable',
      }),
    ).resolves.toEqual({ outcome: 'updated' });
    await expect(
      persistence.claimOutbox({
        workerId: 'worker-b',
        limit: 1,
        now: new Date(availableAt.getTime() - 1),
        claimTimeoutMs: 30_000,
      }),
    ).resolves.toEqual([]);
    const retried = await persistence.claimOutbox({
      workerId: 'worker-b',
      limit: 1,
      now: availableAt,
      claimTimeoutMs: 30_000,
    });
    expect(retried[0]).toMatchObject({ attemptCount: 2, claimedBy: 'worker-b' });
  });

  it('quarantines poisoned work and exposes bounded state diagnostics', async () => {
    const [work] = await persistence.claimOutbox({
      workerId: 'worker-a',
      limit: 1,
      now,
      claimTimeoutMs: 30_000,
    });
    await expect(
      persistence.poisonOutbox({
        outboxRowId: work!.outboxRowId,
        workerId: 'worker-a',
        now,
        errorCode: 'invalid_payload',
      }),
    ).resolves.toEqual({ outcome: 'updated' });

    await expect(persistence.getOutboxDiagnostics(now)).resolves.toEqual({
      counts: {
        Pending: 0,
        Claimed: 0,
        Completed: 0,
        RetryableFailure: 0,
        Poisoned: 1,
      },
      readyCount: 0,
      oldestReadyAt: null,
    });
  });

  it('uses SKIP LOCKED so concurrent workers claim each row once', async () => {
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_outbox"
       (owner_id, session_id, topic, aggregate_type, aggregate_id,
        aggregate_sequence, payload, payload_sha256, available_at)
       SELECT 'owner-a', 'session-a', 'assistant.event', 'session', 'session-a',
              sequence, jsonb_build_object('sequence', sequence), $1, $2
       FROM generate_series(2, 25) AS sequence`,
      [Buffer.alloc(32, 2), now],
    );
    const batches = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        persistence.claimOutbox({
          workerId: `worker-${index}`,
          limit: 5,
          now,
          claimTimeoutMs: 30_000,
        }),
      ),
    );
    const claimed = batches.flat();
    expect(claimed).toHaveLength(25);
    expect(new Set(claimed.map(item => item.outboxRowId)).size).toBe(25);
  });
});
