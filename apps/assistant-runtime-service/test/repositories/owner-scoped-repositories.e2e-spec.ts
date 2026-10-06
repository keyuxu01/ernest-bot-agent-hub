import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresAssistantRuntimePersistence } from '../../src/infrastructure/database/postgres/postgres-assistant-runtime-persistence';
import { CreateAssistantRuntimeCore1791177660000 } from '../../src/infrastructure/database/migrations/1791177660000-create-assistant-runtime-core';
import { CreateAssistantRuntimeExtensions1791177720000 } from '../../src/infrastructure/database/migrations/1791177720000-create-assistant-runtime-extensions';
import { AddAssistantRuntimeProductUniqueness1791177840000 } from '../../src/infrastructure/database/migrations/1791177840000-add-assistant-runtime-product-uniqueness';
import { AddAtomicSessionCommitState1791177900000 } from '../../src/infrastructure/database/migrations/1791177900000-add-atomic-session-commit-state';
import { AddRuntimeQueryIndexes1791177960000 } from '../../src/infrastructure/database/migrations/1791177960000-add-runtime-query-indexes';

const schema = process.env.POSTGRES_SCHEMA;
if (typeof schema !== 'string' || !schema.endsWith('_test')) {
  throw new Error(
    'POSTGRES_SCHEMA must end with _test for destructive repository integration tests',
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
  migrationsTableName: 'assistant_runtime_repository_test_migrations',
  migrations: [
    CreateAssistantRuntimeCore1791177660000,
    CreateAssistantRuntimeExtensions1791177720000,
    AddAssistantRuntimeProductUniqueness1791177840000,
    AddAtomicSessionCommitState1791177900000,
    AddRuntimeQueryIndexes1791177960000,
  ],
});

type FixtureIds = Readonly<{
  ownerId: string;
  sessionId: string;
  settingsId: string;
  commandRowId: string;
  runId: string;
  turnId: string;
  attemptId: string;
  steerId: string;
  connectionId: string;
  bindingId: string;
  snapshotId: string;
  eventRowId: string;
  checkpointId: string;
  toolRowId: string;
  interruptId: string;
  artifactId: string;
  referenceId: string;
  operationId: string;
  sourceRowId: string;
  deletionId: string;
  auditId: string;
}>;

const completedDeletionSteps: Array<{
  step: string;
  attempt: number;
  completedAt: string;
  disposition: string;
  reason?: string;
  remainingArtifactReferences?: number;
}> = [
  'postgres_session_data',
  'checkpoint_tool_records',
  'redis_projection',
  'mem0_session',
  'artifact_references',
  'artifact_blobs',
  'mcp_credentials',
  'binding_metadata',
  'audit_minimization',
].map(step => ({
  step,
  attempt: 1,
  completedAt: '2026-10-05T12:00:00.000Z',
  disposition: 'deleted',
  ...(step === 'artifact_blobs' ? { remainingArtifactReferences: 0 } : {}),
}));

completedDeletionSteps.push(
  {
    step: 'mem0_user_scope',
    attempt: 1,
    completedAt: '2026-10-05T12:00:00.000Z',
    disposition: 'preserved',
    reason: 'user_scoped_memory',
  },
  {
    step: 'independent_forks',
    attempt: 1,
    completedAt: '2026-10-05T12:00:00.000Z',
    disposition: 'preserved',
    reason: 'independent_fork',
  },
);

const insertOwnerFixture = async (suffix: string): Promise<FixtureIds> => {
  const ownerId = `owner-${suffix}`;
  const sessionId = `session-${suffix}`;
  const settingsId = `settings-${suffix}`;
  const runId = `run-${suffix}`;
  const turnId = `turn-${suffix}`;
  const attemptId = `attempt-${suffix}`;
  const steerId = `steer-${suffix}`;
  const connectionId = `mcp-${suffix}`;
  const bindingId = `binding-${suffix}`;
  const snapshotId = `snapshot-${suffix}`;
  const checkpointId = `checkpoint-${suffix}`;
  const interruptId = `interrupt-${suffix}`;
  const artifactId = `artifact-${suffix}`;
  const referenceId = `reference-${suffix}`;
  const operationId = `memory-${suffix}`;
  const deletionId = `deletion-${suffix}`;
  const auditId = `audit-${suffix}`;

  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_session" (session_id, owner_id, title)
     VALUES ($1, $2, $3)`,
    [sessionId, ownerId, `Session ${suffix}`],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_settings"
     (settings_id, owner_id, scope_kind, session_id, provider_connection_id, model)
     VALUES ($1, $2, 'Session', $3, $4, $5)`,
    [settingsId, ownerId, sessionId, `provider-${suffix}`, `model-${suffix}`],
  );
  const commandRows = (await dataSource.query(
    `INSERT INTO "${schema}"."assistant_command"
     (owner_id, command_id, session_id, command_type, request_hash, correlation_id)
     VALUES ($1, $2, $3, 'steer', $4, $5) RETURNING command_row_id`,
    [
      ownerId,
      `command-${suffix}`,
      sessionId,
      Buffer.alloc(32, 1),
      `correlation-${suffix}`,
    ],
  )) as Array<{ command_row_id: string }>;
  const commandRowId = commandRows[0]!.command_row_id;
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_run"
     (run_id, owner_id, session_id, state, settings_version, provider_connection_id, model, started_at)
     VALUES ($1, $2, $3, 'Running', 0, $4, $5, CURRENT_TIMESTAMP)`,
    [runId, ownerId, sessionId, `provider-${suffix}`, `model-${suffix}`],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_turn"
     (turn_id, owner_id, run_id, ordinal, input_event_sequence)
     VALUES ($1, $2, $3, 0, 0)`,
    [turnId, ownerId, runId],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_model_attempt"
     (attempt_id, owner_id, turn_id, ordinal, attempt_state)
     VALUES ($1, $2, $3, 0, 'Started')`,
    [attemptId, ownerId, turnId],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_steer_command"
     (steer_id, owner_id, run_id, source_command_row_id, accepted_ordinal, input_text)
     VALUES ($1, $2, $3, $4, 0, 'continue')`,
    [steerId, ownerId, runId, commandRowId],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_mcp_connection"
     (connection_id, owner_id, display_name, endpoint)
     VALUES ($1, $2, $3, $4)`,
    [connectionId, ownerId, `MCP ${suffix}`, `https://mcp-${suffix}.example.test/v1`],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_client_binding"
     (binding_id, owner_id, session_id, cli_instance_id, workspace_id, workspace_fingerprint,
      stream_secret_reference, capabilities, approval_policy, lease_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'secret://binding/test', '["read"]'::jsonb,
      '{}'::jsonb, CURRENT_TIMESTAMP + interval '5 minutes')`,
    [
      bindingId,
      ownerId,
      sessionId,
      `cli-${suffix}`,
      `workspace-${suffix}`,
      Buffer.alloc(32, 2),
    ],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_context_snapshot"
     (snapshot_id, owner_id, session_id, run_id, turn_id, workspace_id, manifest_sha256,
      source_manifest, accepted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '[]'::jsonb, CURRENT_TIMESTAMP)`,
    [
      snapshotId,
      ownerId,
      sessionId,
      runId,
      turnId,
      `workspace-${suffix}`,
      Buffer.alloc(32, 3),
    ],
  );
  const eventRows = (await dataSource.query(
    `INSERT INTO "${schema}"."assistant_event"
     (owner_id, event_id, session_id, run_id, sequence, event_type, payload, payload_sha256, occurred_at)
     VALUES ($1, $2, $3, $4, 1, 'message', '{"type":"message"}'::jsonb, $5, CURRENT_TIMESTAMP)
     RETURNING event_row_id`,
    [ownerId, `event-${suffix}`, sessionId, runId, Buffer.alloc(32, 4)],
  )) as Array<{ event_row_id: string }>;
  const eventRowId = eventRows[0]!.event_row_id;
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_checkpoint"
     (checkpoint_id, owner_id, session_id, run_id, thread_id, checkpoint_version,
      run_resource_version, last_event_sequence, ciphertext, ciphertext_sha256,
      encryption_key_reference, encryption_nonce, encryption_auth_tag)
     VALUES ($1, $2, $3, $4, $5, 1, 0, 1, $6, $7, 'secret://checkpoint/test', $8, $9)`,
    [
      checkpointId,
      ownerId,
      sessionId,
      runId,
      `thread-${suffix}`,
      Buffer.from('cipher'),
      Buffer.alloc(32, 5),
      Buffer.alloc(12, 6),
      Buffer.alloc(16, 7),
    ],
  );
  const toolRows = (await dataSource.query(
    `INSERT INTO "${schema}"."assistant_tool_execution"
     (owner_id, execution_id, session_id, run_id, turn_id, location, tool_name,
      tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token)
     VALUES ($1, $2, $3, $4, $5, 'runtime', 'fixture_tool', $6, 1, $7,
      '{}'::jsonb, 'safe_retry', 0) RETURNING execution_row_id`,
    [
      ownerId,
      `execution-${suffix}`,
      sessionId,
      runId,
      turnId,
      Buffer.alloc(32, 8),
      Buffer.alloc(32, 9),
    ],
  )) as Array<{ execution_row_id: string }>;
  const toolRowId = toolRows[0]!.execution_row_id;
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_interrupt"
     (interrupt_id, owner_id, session_id, run_id, tool_execution_row_id, checkpoint_id,
      interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders)
     VALUES ($1, $2, $3, $4, $5, $6, 'question', '{}'::jsonb, $7,
      '{}'::jsonb, '{}'::jsonb, $8::jsonb)`,
    [
      interruptId,
      ownerId,
      sessionId,
      runId,
      toolRowId,
      checkpointId,
      Buffer.alloc(32, 10),
      JSON.stringify([bindingId]),
    ],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_artifact"
     (artifact_id, owner_id, session_id, run_id, tool_execution_row_id, kind, mime_type,
      content_sha256, byte_size, storage_reference_id)
     VALUES ($1, $2, $3, $4, $5, 'text', 'text/plain', $6, 7, $7)`,
    [
      artifactId,
      ownerId,
      sessionId,
      runId,
      toolRowId,
      Buffer.alloc(32, 11),
      `storage://${artifactId}`,
    ],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_artifact_reference"
     (reference_id, owner_id, artifact_id, session_id, run_id, event_row_id,
      tool_execution_row_id, reference_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'tool_result')`,
    [referenceId, ownerId, artifactId, sessionId, runId, eventRowId, toolRowId],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_memory_operation"
     (operation_id, owner_id, session_id, source_session_id, run_id, scope_kind,
      operation, request_hash, request_payload)
     VALUES ($1, $2, $3, $3, $4, 'session', 'extract', $5, '{}'::jsonb)`,
    [operationId, ownerId, sessionId, runId, Buffer.alloc(32, 12)],
  );
  const sourceRows = (await dataSource.query(
    `INSERT INTO "${schema}"."assistant_memory_operation_source"
     (operation_id, event_row_id, owner_id, source_session_id, source_run_id, sequence)
     VALUES ($1, $2, $3, $4, $5, 1) RETURNING source_row_id`,
    [operationId, eventRowId, ownerId, sessionId, runId],
  )) as Array<{ source_row_id: string }>;
  const sourceRowId = sourceRows[0]!.source_row_id;
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_deletion_receipt"
     (deletion_id, owner_id, session_id, status, attempt, correlation_id,
      confirmation_hash, steps, steps_sha256, requested_at, completed_at)
     VALUES ($1, $2, $3, 'completed', 1, $4, $5, $6::jsonb, $7,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      deletionId,
      ownerId,
      sessionId,
      `deletion-correlation-${suffix}`,
      Buffer.alloc(32, 14),
      JSON.stringify(completedDeletionSteps),
      Buffer.alloc(32, 15),
    ],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_audit_record"
     (audit_id, owner_id, session_id, run_id, actor_type, actor_id, action, target_type,
      target_id, result_class, decision_kind, policy_id, policy_version, correlation_id,
      request_id, reason_code, redacted_metadata, metadata_sha256, occurred_at)
     VALUES ($1, $2, $3, $4, 'user', $2, 'authorization', 'session', $3,
      'success', 'authorization', 'policy-test', 1, $5, $6, 'ALLOWED', '{}'::jsonb, $7,
      CURRENT_TIMESTAMP)`,
    [
      auditId,
      ownerId,
      sessionId,
      runId,
      `correlation-${suffix}`,
      `request-${suffix}`,
      Buffer.alloc(32, 13),
    ],
  );

  return {
    ownerId,
    sessionId,
    settingsId,
    commandRowId,
    runId,
    turnId,
    attemptId,
    steerId,
    connectionId,
    bindingId,
    snapshotId,
    eventRowId,
    checkpointId,
    toolRowId,
    interruptId,
    artifactId,
    referenceId,
    operationId,
    sourceRowId,
    deletionId,
    auditId,
  };
};

describe('owner-scoped PostgreSQL repositories', () => {
  let persistence: PostgresAssistantRuntimePersistence;
  let ownerA: FixtureIds;
  let ownerB: FixtureIds;

  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.query(
      'DROP TABLE IF EXISTS "assistant_runtime_repository_test_migrations"',
    );
    await dataSource.runMigrations();
    persistence = new PostgresAssistantRuntimePersistence(dataSource, schema);
  });

  beforeEach(async () => {
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
      'assistant_checkpoint',
      'assistant_event',
      'assistant_client_binding',
      'assistant_mcp_connection',
      'assistant_steer_command',
      'assistant_model_attempt',
      'assistant_turn',
      'assistant_run',
      'assistant_command',
      'assistant_settings',
      'assistant_session',
    ]) {
      await dataSource.query(`TRUNCATE TABLE "${schema}"."${table}" CASCADE`);
    }
    ownerA = await insertOwnerFixture('a');
    ownerB = await insertOwnerFixture('b');
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.query(
        'DROP TABLE IF EXISTS "assistant_runtime_repository_test_migrations"',
      );
      await dataSource.destroy();
    }
  });

  it('owner A can read every exposed resource family while owner B cannot guess A IDs', async () => {
    const a = persistence.forOwner(ownerA.ownerId);
    const b = persistence.forOwner(ownerB.ownerId);
    const probes = [
      [
        () => a.sessions.findSession(ownerA.sessionId),
        () => b.sessions.findSession(ownerA.sessionId),
      ],
      [
        () => a.sessions.findSettings(ownerA.settingsId),
        () => b.sessions.findSettings(ownerA.settingsId),
      ],
      [
        () => a.executions.findCommand(ownerA.commandRowId),
        () => b.executions.findCommand(ownerA.commandRowId),
      ],
      [
        () => a.executions.findRun(ownerA.runId),
        () => b.executions.findRun(ownerA.runId),
      ],
      [
        () => a.executions.findTurn(ownerA.turnId),
        () => b.executions.findTurn(ownerA.turnId),
      ],
      [
        () => a.executions.findModelAttempt(ownerA.attemptId),
        () => b.executions.findModelAttempt(ownerA.attemptId),
      ],
      [
        () => a.executions.findSteerCommand(ownerA.steerId),
        () => b.executions.findSteerCommand(ownerA.steerId),
      ],
      [
        () => a.history.findEvent(ownerA.eventRowId),
        () => b.history.findEvent(ownerA.eventRowId),
      ],
      [
        () => a.connections.findMcpConnection(ownerA.connectionId),
        () => b.connections.findMcpConnection(ownerA.connectionId),
      ],
      [
        () => a.connections.findClientBinding(ownerA.bindingId),
        () => b.connections.findClientBinding(ownerA.bindingId),
      ],
      [
        () => a.tools.findContextSnapshot(ownerA.snapshotId),
        () => b.tools.findContextSnapshot(ownerA.snapshotId),
      ],
      [
        () => a.tools.findCheckpoint(ownerA.checkpointId),
        () => b.tools.findCheckpoint(ownerA.checkpointId),
      ],
      [
        () => a.tools.findToolExecution(ownerA.toolRowId),
        () => b.tools.findToolExecution(ownerA.toolRowId),
      ],
      [
        () => a.tools.findInterrupt(ownerA.interruptId),
        () => b.tools.findInterrupt(ownerA.interruptId),
      ],
      [
        () => a.artifacts.findArtifact(ownerA.artifactId),
        () => b.artifacts.findArtifact(ownerA.artifactId),
      ],
      [
        () => a.artifacts.findArtifactReference(ownerA.referenceId),
        () => b.artifacts.findArtifactReference(ownerA.referenceId),
      ],
      [
        () => a.memory.findMemoryOperation(ownerA.operationId),
        () => b.memory.findMemoryOperation(ownerA.operationId),
      ],
      [
        () => a.memory.findMemoryOperationSource(ownerA.sourceRowId),
        () => b.memory.findMemoryOperationSource(ownerA.sourceRowId),
      ],
      [
        () => a.governance.findDeletionReceipt(ownerA.deletionId),
        () => b.governance.findDeletionReceipt(ownerA.deletionId),
      ],
      [
        () => a.governance.findAuditRecord(ownerA.auditId),
        () => b.governance.findAuditRecord(ownerA.auditId),
      ],
    ] as const;

    for (const [ownRead, foreignRead] of probes) {
      await expect(ownRead()).resolves.not.toBeNull();
      await expect(foreignRead()).resolves.toBeNull();
    }
  });

  it('returns one indistinguishable result for foreign and unknown mutations', async () => {
    const b = persistence.forOwner(ownerB.ownerId);
    await expect(
      b.sessions.updateSessionTitle(ownerA.sessionId, 'stolen'),
    ).resolves.toEqual({ outcome: 'not_found_or_not_authorized' });
    await expect(b.sessions.updateSessionTitle('unknown', 'stolen')).resolves.toEqual({
      outcome: 'not_found_or_not_authorized',
    });
    await expect(
      b.connections.updateMcpConnectionDisplayName(ownerA.connectionId, 'stolen'),
    ).resolves.toEqual({ outcome: 'not_found_or_not_authorized' });
    await expect(
      b.connections.updateMcpConnectionDisplayName('unknown', 'stolen'),
    ).resolves.toEqual({ outcome: 'not_found_or_not_authorized' });

    const a = persistence.forOwner(ownerA.ownerId);
    expect((await a.sessions.findSession(ownerA.sessionId))?.title).toBe('Session a');
    expect(
      (await a.connections.findMcpConnection(ownerA.connectionId))?.display_name,
    ).toBe('MCP a');
  });

  it('commits two repository writes through one owner-scoped transaction', async () => {
    await persistence.withOwnerTransaction(ownerA.ownerId, async repositories => {
      await expect(
        repositories.sessions.updateSessionTitle(ownerA.sessionId, 'Committed title'),
      ).resolves.toEqual({ outcome: 'updated' });
      await expect(
        repositories.connections.updateMcpConnectionDisplayName(
          ownerA.connectionId,
          'Committed MCP',
        ),
      ).resolves.toEqual({ outcome: 'updated' });
    });
    const a = persistence.forOwner(ownerA.ownerId);
    expect((await a.sessions.findSession(ownerA.sessionId))?.title).toBe(
      'Committed title',
    );
    expect(
      (await a.connections.findMcpConnection(ownerA.connectionId))?.display_name,
    ).toBe('Committed MCP');
  });

  it('rolls back every repository write and preserves the original error', async () => {
    const failure = new Error('force rollback');
    await expect(
      persistence.withOwnerTransaction(ownerA.ownerId, async repositories => {
        await repositories.sessions.updateSessionTitle(
          ownerA.sessionId,
          'Rolled back title',
        );
        await repositories.connections.updateMcpConnectionDisplayName(
          ownerA.connectionId,
          'Rolled back MCP',
        );
        throw failure;
      }),
    ).rejects.toBe(failure);

    const a = persistence.forOwner(ownerA.ownerId);
    expect((await a.sessions.findSession(ownerA.sessionId))?.title).toBe('Session a');
    expect(
      (await a.connections.findMcpConnection(ownerA.connectionId))?.display_name,
    ).toBe('MCP a');
  });

  it('keeps guessed-ID mutations owner-scoped inside a transaction', async () => {
    await persistence.withOwnerTransaction(ownerB.ownerId, async repositories => {
      await expect(
        repositories.sessions.updateSessionTitle(ownerA.sessionId, 'stolen'),
      ).resolves.toEqual({ outcome: 'not_found_or_not_authorized' });
      await expect(
        repositories.connections.updateMcpConnectionDisplayName(
          ownerA.connectionId,
          'stolen',
        ),
      ).resolves.toEqual({ outcome: 'not_found_or_not_authorized' });
    });
    const a = persistence.forOwner(ownerA.ownerId);
    expect((await a.sessions.findSession(ownerA.sessionId))?.title).toBe('Session a');
    expect(
      (await a.connections.findMcpConnection(ownerA.connectionId))?.display_name,
    ).toBe('MCP a');
  });

  it('rejects an empty owner before issuing a product query', () => {
    expect(() => persistence.forOwner('   ')).toThrow('ownerId must be non-empty');
  });
});
