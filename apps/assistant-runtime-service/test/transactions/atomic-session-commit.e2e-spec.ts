import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresAssistantRuntimePersistence } from '../../src/infrastructure/database/postgres/postgres-assistant-runtime-persistence';
import { CreateAssistantRuntimeCore1791177660000 } from '../../src/infrastructure/database/migrations/1791177660000-create-assistant-runtime-core';
import { CreateAssistantRuntimeExtensions1791177720000 } from '../../src/infrastructure/database/migrations/1791177720000-create-assistant-runtime-extensions';
import { AddAssistantRuntimeProductUniqueness1791177840000 } from '../../src/infrastructure/database/migrations/1791177840000-add-assistant-runtime-product-uniqueness';
import { AddAtomicSessionCommitState1791177900000 } from '../../src/infrastructure/database/migrations/1791177900000-add-atomic-session-commit-state';
import { AddRuntimeQueryIndexes1791177960000 } from '../../src/infrastructure/database/migrations/1791177960000-add-runtime-query-indexes';
import type { AtomicSessionCommitInput } from '../../src/modules/assistant/application/ports/assistant-runtime-atomic-commit.port';

const schema = process.env.POSTGRES_SCHEMA;
if (typeof schema !== 'string' || !schema.endsWith('_test')) {
  throw new Error(
    'POSTGRES_SCHEMA must end with _test for destructive transaction integration tests',
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
  migrationsTableName: 'assistant_runtime_transaction_test_migrations',
  migrations: [
    CreateAssistantRuntimeCore1791177660000,
    CreateAssistantRuntimeExtensions1791177720000,
    AddAssistantRuntimeProductUniqueness1791177840000,
    AddAtomicSessionCommitState1791177900000,
    AddRuntimeQueryIndexes1791177960000,
  ],
});

const insertSession = async (ownerId: string, sessionId: string): Promise<void> => {
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_session" (session_id, owner_id, title)
     VALUES ($1, $2, $3)`,
    [sessionId, ownerId, `Session ${sessionId}`],
  );
};

const insertRun = async (
  ownerId: string,
  sessionId: string,
  runId: string,
): Promise<void> => {
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_run"
     (run_id, owner_id, session_id, state, settings_version, provider_connection_id,
      model, started_at)
     VALUES ($1, $2, $3, 'Running', 0, 'provider-test', 'model-test', CURRENT_TIMESTAMP)`,
    [runId, ownerId, sessionId],
  );
};

const insertCheckpoint = async (
  ownerId: string,
  sessionId: string,
  runId: string,
  checkpointId: string,
): Promise<void> => {
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_checkpoint"
     (checkpoint_id, owner_id, session_id, run_id, thread_id, checkpoint_version,
      run_resource_version, last_event_sequence, ciphertext, ciphertext_sha256,
      encryption_key_reference, encryption_nonce, encryption_auth_tag)
     VALUES ($1, $2, $3, $4, $5, 1, 1, 1, $6, $7,
      'secret://checkpoint/test', $8, $9)`,
    [
      checkpointId,
      ownerId,
      sessionId,
      runId,
      `thread-${checkpointId}`,
      Buffer.from('cipher'),
      Buffer.alloc(32, 3),
      Buffer.alloc(12, 4),
      Buffer.alloc(16, 5),
    ],
  );
};

const waitForCheckpointLock = async (): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const waiting = (await dataSource.query(
      `SELECT pid FROM pg_stat_activity
       WHERE datname = current_database()
         AND wait_event_type = 'Lock'
         AND query LIKE $1`,
      ['%assistant_atomic_checkpoint_ready%'],
    )) as unknown[];
    if (waiting.length > 0) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Atomic commit did not reach the checkpoint lock barrier');
};

const commitInput = (
  eventId: string,
  sessionId = 'session-a',
): AtomicSessionCommitInput => ({
  ownerId: 'owner-a',
  sessionId,
  event: {
    eventId,
    type: 'message',
    payload: { type: 'message', text: eventId },
    payloadSha256: Buffer.alloc(32, 1),
    occurredAt: new Date('2026-10-05T12:00:00.000Z'),
  },
  outbox: {
    topic: 'assistant.event',
    payload: { eventId },
    payloadSha256: Buffer.alloc(32, 2),
  },
});

describe.sequential('atomic Session commit', () => {
  let persistence: PostgresAssistantRuntimePersistence;

  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.query(
      'DROP TABLE IF EXISTS "assistant_runtime_transaction_test_migrations"',
    );
    await dataSource.runMigrations();
    persistence = new PostgresAssistantRuntimePersistence(dataSource, schema);
  });

  beforeEach(async () => {
    await dataSource.query(`
      TRUNCATE TABLE
        "${schema}"."assistant_outbox",
        "${schema}"."assistant_event",
        "${schema}"."assistant_checkpoint",
        "${schema}"."assistant_run",
        "${schema}"."assistant_session"
      CASCADE
    `);
    await insertSession('owner-a', 'session-a');
    await insertSession('owner-a', 'session-c');
    await insertSession('owner-b', 'session-b');
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.query(
        'DROP TABLE IF EXISTS "assistant_runtime_transaction_test_migrations"',
      );
      await dataSource.destroy();
    }
  });

  it('commits Event, Session head/version and Pending Outbox together', async () => {
    await expect(persistence.commit(commitInput('event-1'))).resolves.toMatchObject({
      outcome: 'committed',
      sequence: 1,
      sessionVersion: 1,
      runVersion: null,
    });

    const [session] = (await dataSource.query(
      `SELECT resource_version, next_event_sequence, active_head_sequence
       FROM "${schema}"."assistant_session" WHERE session_id = 'session-a'`,
    )) as Array<Record<string, string>>;
    expect(session).toMatchObject({
      resource_version: '1',
      next_event_sequence: '2',
      active_head_sequence: '1',
    });
    const [counts] = (await dataSource.query(
      `SELECT
         (SELECT count(*) FROM "${schema}"."assistant_event") AS events,
         (SELECT count(*) FROM "${schema}"."assistant_outbox" WHERE state = 'Pending') AS outbox`,
    )) as Array<Record<string, string>>;
    expect(counts).toEqual({ events: '1', outbox: '1' });
  });

  it('serializes concurrent writers without committed sequence gaps per Session', async () => {
    const commitMany = async (sessionId: string, prefix: string) =>
      Promise.all(
        Array.from({ length: 32 }, (_, index) =>
          persistence.commit(commitInput(`${prefix}-${index}`, sessionId)),
        ),
      );

    const [sessionAResults, sessionCResults] = await Promise.all([
      commitMany('session-a', 'a'),
      commitMany('session-c', 'c'),
    ]);
    for (const results of [sessionAResults, sessionCResults]) {
      expect(results.every(result => result.outcome === 'committed')).toBe(true);
      const sequences = results
        .map(result => (result.outcome === 'committed' ? result.sequence : -1))
        .sort((left, right) => left - right);
      expect(sequences).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
    }

    const rows = (await dataSource.query(
      `SELECT session_id, resource_version, next_event_sequence, active_head_sequence
       FROM "${schema}"."assistant_session"
       WHERE session_id IN ('session-a', 'session-c') ORDER BY session_id`,
    )) as Array<Record<string, string>>;
    expect(rows).toEqual([
      {
        session_id: 'session-a',
        resource_version: '32',
        next_event_sequence: '33',
        active_head_sequence: '32',
      },
      {
        session_id: 'session-c',
        resource_version: '32',
        next_event_sequence: '33',
        active_head_sequence: '32',
      },
    ]);
    const committedRows = (await dataSource.query(
      `SELECT event.session_id,
              count(*) AS event_count,
              min(event.sequence) AS min_sequence,
              max(event.sequence) AS max_sequence,
              count(DISTINCT event.sequence) AS distinct_sequences,
              count(outbox.outbox_row_id) AS outbox_count
       FROM "${schema}"."assistant_event" AS event
       JOIN "${schema}"."assistant_outbox" AS outbox
         ON outbox.event_row_id = event.event_row_id
        AND outbox.session_id = event.session_id
        AND outbox.owner_id = event.owner_id
       WHERE event.session_id IN ('session-a', 'session-c')
       GROUP BY event.session_id
       ORDER BY event.session_id`,
    )) as Array<Record<string, string>>;
    expect(committedRows).toEqual([
      {
        session_id: 'session-a',
        event_count: '32',
        min_sequence: '1',
        max_sequence: '32',
        distinct_sequences: '32',
        outbox_count: '32',
      },
      {
        session_id: 'session-c',
        event_count: '32',
        min_sequence: '1',
        max_sequence: '32',
        distinct_sequences: '32',
        outbox_count: '32',
      },
    ]);
  });

  it('allows only one same-version Run transition and consumes no sequence for the conflict', async () => {
    await insertRun('owner-a', 'session-a', 'run-a');
    const makeRunInput = (eventId: string): AtomicSessionCommitInput => ({
      ...commitInput(eventId),
      event: {
        ...commitInput(eventId).event,
        runId: 'run-a',
        type: 'run_state',
        payload: { type: 'run_state' },
      },
      runTransition: { runId: 'run-a', expectedVersion: 0, newState: 'Cancelling' },
    });
    const results = await Promise.all([
      persistence.commit(makeRunInput('run-event-1')),
      persistence.commit(makeRunInput('run-event-2')),
    ]);
    expect(results.filter(result => result.outcome === 'committed')).toHaveLength(1);
    expect(
      results.filter(result => result.outcome === 'not_found_or_transition_conflict'),
    ).toHaveLength(1);
    const [session] = (await dataSource.query(
      `SELECT next_event_sequence, active_head_sequence FROM "${schema}"."assistant_session"
       WHERE session_id = 'session-a'`,
    )) as Array<Record<string, string>>;
    expect(session).toEqual({ next_event_sequence: '2', active_head_sequence: '1' });
  });

  it('atomically binds a matching Ready checkpoint and rejects foreign lineage', async () => {
    await insertRun('owner-a', 'session-a', 'run-a');
    await insertRun('owner-b', 'session-b', 'run-b');
    await insertCheckpoint('owner-a', 'session-a', 'run-a', 'checkpoint-a');
    await insertCheckpoint('owner-b', 'session-b', 'run-b', 'checkpoint-b');

    const mismatch = await persistence.commit({
      ...commitInput('checkpoint-mismatch'),
      event: {
        ...commitInput('checkpoint-mismatch').event,
        runId: 'run-a',
        type: 'run_state',
        payload: { type: 'run_state' },
      },
      runTransition: {
        runId: 'run-a',
        expectedVersion: 0,
        newState: 'Cancelling',
        checkpointId: 'checkpoint-b',
      },
    });
    expect(mismatch).toEqual({ outcome: 'not_found_or_transition_conflict' });

    const committed = await persistence.commit({
      ...commitInput('checkpoint-success'),
      event: {
        ...commitInput('checkpoint-success').event,
        runId: 'run-a',
        type: 'run_state',
        payload: { type: 'run_state' },
      },
      runTransition: {
        runId: 'run-a',
        expectedVersion: 0,
        newState: 'Cancelling',
        checkpointId: 'checkpoint-a',
      },
    });
    expect(committed).toMatchObject({ outcome: 'committed', sequence: 1, runVersion: 1 });
    const followUp = await persistence.commit({
      ...commitInput('checkpoint-follow-up'),
      event: {
        ...commitInput('checkpoint-follow-up').event,
        runId: 'run-a',
        type: 'run_state',
        payload: { type: 'run_state' },
      },
      runTransition: {
        runId: 'run-a',
        expectedVersion: 1,
        newState: 'Running',
      },
    });
    expect(followUp).toMatchObject({ outcome: 'committed', sequence: 2 });
    const [run] = (await dataSource.query(
      `SELECT resource_version, current_checkpoint_id FROM "${schema}"."assistant_run"
       WHERE run_id = 'run-a'`,
    )) as Array<Record<string, string>>;
    expect(run).toEqual({ resource_version: '2', current_checkpoint_id: 'checkpoint-a' });
  });

  it('cannot bind a checkpoint concurrently changed away from Ready', async () => {
    await insertRun('owner-a', 'session-a', 'run-a');
    await insertCheckpoint('owner-a', 'session-a', 'run-a', 'checkpoint-a');
    const lifecycleWriter = dataSource.createQueryRunner();
    await lifecycleWriter.connect();
    await lifecycleWriter.startTransaction();
    await lifecycleWriter.query(
      `UPDATE "${schema}"."assistant_checkpoint"
       SET state = 'Quarantined', quarantined_at = CURRENT_TIMESTAMP
       WHERE checkpoint_id = 'checkpoint-a'`,
    );

    const commitPromise = persistence.commit({
      ...commitInput('checkpoint-race'),
      event: {
        ...commitInput('checkpoint-race').event,
        runId: 'run-a',
        type: 'run_state',
        payload: { type: 'run_state' },
      },
      runTransition: {
        runId: 'run-a',
        expectedVersion: 0,
        newState: 'Cancelling',
        checkpointId: 'checkpoint-a',
      },
    });
    await waitForCheckpointLock();
    await lifecycleWriter.commitTransaction();
    await lifecycleWriter.release();

    await expect(commitPromise).resolves.toEqual({
      outcome: 'not_found_or_transition_conflict',
    });
    const [state] = (await dataSource.query(
      `SELECT
         (SELECT resource_version FROM "${schema}"."assistant_run" WHERE run_id = 'run-a') AS run_version,
         (SELECT count(*) FROM "${schema}"."assistant_event") AS events,
         (SELECT next_event_sequence FROM "${schema}"."assistant_session" WHERE session_id = 'session-a') AS next_sequence`,
    )) as Array<Record<string, string>>;
    expect(state).toEqual({ run_version: '0', events: '0', next_sequence: '1' });
  });

  it('rolls back every write on Outbox failure and reuses the candidate sequence', async () => {
    await insertRun('owner-a', 'session-a', 'run-a');
    await dataSource.query(`
      CREATE FUNCTION "${schema}"."fail_test_outbox"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.topic = 'fail.test' THEN RAISE EXCEPTION 'forced outbox failure'; END IF;
        RETURN NEW;
      END $$
    `);
    await dataSource.query(`
      CREATE TRIGGER "fail_test_outbox" BEFORE INSERT ON "${schema}"."assistant_outbox"
      FOR EACH ROW EXECUTE FUNCTION "${schema}"."fail_test_outbox"()
    `);
    const failedInput: AtomicSessionCommitInput = {
      ...commitInput('rollback-event'),
      event: {
        ...commitInput('rollback-event').event,
        runId: 'run-a',
        type: 'run_state',
        payload: { type: 'run_state' },
      },
      runTransition: { runId: 'run-a', expectedVersion: 0, newState: 'Cancelling' },
      outbox: { ...commitInput('rollback-event').outbox, topic: 'fail.test' },
    };
    await expect(persistence.commit(failedInput)).rejects.toThrow(
      'forced outbox failure',
    );
    const [afterFailure] = (await dataSource.query(
      `SELECT
         (SELECT resource_version FROM "${schema}"."assistant_session" WHERE session_id = 'session-a') AS session_version,
         (SELECT next_event_sequence FROM "${schema}"."assistant_session" WHERE session_id = 'session-a') AS next_sequence,
         (SELECT resource_version FROM "${schema}"."assistant_run" WHERE run_id = 'run-a') AS run_version,
         (SELECT count(*) FROM "${schema}"."assistant_event") AS events,
         (SELECT count(*) FROM "${schema}"."assistant_outbox") AS outbox`,
    )) as Array<Record<string, string>>;
    expect(afterFailure).toEqual({
      session_version: '0',
      next_sequence: '1',
      run_version: '0',
      events: '0',
      outbox: '0',
    });

    await dataSource.query(
      `DROP TRIGGER "fail_test_outbox" ON "${schema}"."assistant_outbox"`,
    );
    const recovered = await persistence.commit({
      ...failedInput,
      outbox: { ...failedInput.outbox, topic: 'assistant.event' },
    });
    expect(recovered).toMatchObject({ outcome: 'committed', sequence: 1 });
  });

  it('hides foreign Sessions and rolls back duplicate event identity without a gap', async () => {
    const foreign = await persistence.commit({
      ...commitInput('foreign-event'),
      ownerId: 'owner-b',
    });
    expect(foreign).toEqual({ outcome: 'not_found_or_transition_conflict' });
    await persistence.commit(commitInput('duplicate-event'));
    await expect(persistence.commit(commitInput('duplicate-event'))).rejects.toThrow();
    const [session] = (await dataSource.query(
      `SELECT resource_version, next_event_sequence, active_head_sequence
       FROM "${schema}"."assistant_session" WHERE session_id = 'session-a'`,
    )) as Array<Record<string, string>>;
    expect(session).toEqual({
      resource_version: '1',
      next_event_sequence: '2',
      active_head_sequence: '1',
    });
  });
});
