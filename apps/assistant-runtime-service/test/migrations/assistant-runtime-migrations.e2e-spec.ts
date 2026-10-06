import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type MigrationModule = {
  default: DataSource;
};

const schema = process.env.POSTGRES_SCHEMA;
if (typeof schema !== 'string' || !schema.endsWith('_test')) {
  throw new Error(
    'POSTGRES_SCHEMA must end with _test for destructive migration integration tests',
  );
}

// 从 dist 加载，确保真实验收的是编译后 migration/CLI 入口而非源码别名。
const requireFromPackage = createRequire(resolve(process.cwd(), 'package.json'));
const migrationModule = requireFromPackage(
  resolve(
    process.cwd(),
    'dist/infrastructure/database/assistant-runtime-migration-data-source.js',
  ),
) as MigrationModule;
const dataSource = migrationModule.default;

const expectedCoreTables = [
  'assistant_command',
  'assistant_model_attempt',
  'assistant_run',
  'assistant_session',
  'assistant_settings',
  'assistant_steer_command',
  'assistant_turn',
];

const expectedExtensionTables = [
  'assistant_artifact',
  'assistant_artifact_reference',
  'assistant_audit_record',
  'assistant_checkpoint',
  'assistant_client_binding',
  'assistant_compaction',
  'assistant_context_snapshot',
  'assistant_deletion_receipt',
  'assistant_event',
  'assistant_interrupt',
  'assistant_mcp_connection',
  'assistant_memory_operation',
  'assistant_memory_operation_source',
  'assistant_outbox',
  'assistant_tool_execution',
];

const expectedTables = [...expectedCoreTables, ...expectedExtensionTables].sort();

const tableNames = async (): Promise<string[]> => {
  const rows = (await dataSource.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
    [schema],
  )) as Array<{ table_name: string }>;
  return rows.map(row => row.table_name);
};

const insertLegalChain = async (): Promise<void> => {
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_session"
     (session_id, owner_id, title) VALUES ('session-1', 'owner-1', 'Fixture session')`,
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_settings"
     (settings_id, owner_id, scope_kind, session_id, provider_connection_id, model)
     VALUES ('settings-1', 'owner-1', 'Session', 'session-1', 'provider-1', 'fixture/model-v1')`,
  );
  const commandRows = (await dataSource.query(
    `INSERT INTO "${schema}"."assistant_command"
     (owner_id, command_id, session_id, command_type, request_hash, correlation_id)
     VALUES ('owner-1', 'command-1', 'session-1', 'steer', $1, 'correlation-1')
     RETURNING command_row_id`,
    [Buffer.alloc(32, 3)],
  )) as Array<{ command_row_id: string }>;
  const commandRowId = commandRows[0]?.command_row_id;
  expect(commandRowId).toBeDefined();

  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_run"
     (run_id, owner_id, session_id, state, settings_version, provider_connection_id, model, started_at)
     VALUES ('run-1', 'owner-1', 'session-1', 'Running', 0, 'provider-1', 'fixture/model-v1', CURRENT_TIMESTAMP)`,
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_turn"
     (turn_id, owner_id, run_id, ordinal, input_event_sequence)
     VALUES ('turn-1', 'owner-1', 'run-1', 0, 0)`,
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_model_attempt"
     (attempt_id, owner_id, turn_id, ordinal, attempt_state, outcome, finished_at)
     VALUES ('attempt-1', 'owner-1', 'turn-1', 0, 'Finished', 'completed', CURRENT_TIMESTAMP)`,
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_steer_command"
     (steer_id, owner_id, run_id, source_command_row_id, accepted_ordinal, input_text)
     VALUES ('steer-1', 'owner-1', 'run-1', $1, 0, 'Continue with the fixture')`,
    [commandRowId],
  );
};

const completedDeletionSteps: Array<{
  step: string;
  attempt: number;
  completedAt: string;
  disposition: string;
  reason?: string;
  remainingArtifactReferences?: number;
  failureCode?: string;
  cleanupReferenceId?: string;
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
}));

// artifact_blobs 的删除结论必须显式记录仍被引用的数量，避免伪造“已删完”。
const deletedArtifactBlobStep = completedDeletionSteps.find(
  step => step.step === 'artifact_blobs',
);
if (deletedArtifactBlobStep !== undefined) {
  deletedArtifactBlobStep.remainingArtifactReferences = 0;
}

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

/** 插入跨越 4.2 全部表的一条合法 owner/Session/Run 血缘。 */
const insertLegalExtensionChain = async (): Promise<void> => {
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_mcp_connection"
     (connection_id, owner_id, display_name, endpoint, auth_secret_reference, enabled, status, catalog_generation, checked_at)
     VALUES ('mcp-1', 'owner-1', 'Fixture MCP', 'https://mcp.example.test/v1', 'secret://mcp/fixture', true, 'ready', 1, CURRENT_TIMESTAMP)`,
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_client_binding"
     (binding_id, owner_id, session_id, cli_instance_id, workspace_id, workspace_fingerprint, stream_secret_reference, capabilities, approval_policy, lease_expires_at)
     VALUES ('binding-1', 'owner-1', 'session-1', 'cli-1', 'workspace-1', $1, 'secret://binding/fixture', $2::jsonb, $3::jsonb, CURRENT_TIMESTAMP + interval '5 minutes')`,
    [Buffer.alloc(32, 1), JSON.stringify(['file_read']), JSON.stringify({ version: 0 })],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_context_snapshot"
     (snapshot_id, owner_id, session_id, run_id, turn_id, workspace_id, manifest_sha256, source_manifest, accepted_at)
     VALUES ('snapshot-1', 'owner-1', 'session-1', 'run-1', 'turn-1', 'workspace-1', $1, $2::jsonb, CURRENT_TIMESTAMP)`,
    [
      Buffer.alloc(32, 2),
      JSON.stringify([
        {
          relativePath: 'AGENTS.md',
          sha256: 'a'.repeat(64),
          kind: 'agents',
          trust: 'workspace_instruction',
          contentReference: 'artifact://context-1',
        },
      ]),
    ],
  );
  const eventRows = (await dataSource.query(
    `INSERT INTO "${schema}"."assistant_event"
     (owner_id, event_id, session_id, run_id, sequence, event_type, payload, payload_sha256, occurred_at)
     VALUES ('owner-1', 'event-1', 'session-1', 'run-1', 1, 'compaction', $1::jsonb, $2, CURRENT_TIMESTAMP)
     RETURNING event_row_id`,
    [
      JSON.stringify({ type: 'compaction', coveredThroughSequence: 0 }),
      Buffer.alloc(32, 3),
    ],
  )) as Array<{ event_row_id: string }>;
  const eventRowId = eventRows[0]?.event_row_id;
  expect(eventRowId).toBeDefined();

  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_outbox"
     (owner_id, session_id, run_id, event_row_id, topic, aggregate_type, aggregate_id, aggregate_sequence, payload, payload_sha256)
     VALUES ('owner-1', 'session-1', 'run-1', $1, 'assistant.event', 'session', 'session-1', 1, $2::jsonb, $3)`,
    [eventRowId, JSON.stringify({ eventId: 'event-1' }), Buffer.alloc(32, 4)],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_checkpoint"
     (checkpoint_id, owner_id, session_id, run_id, thread_id, checkpoint_version, run_resource_version, last_event_sequence, ciphertext, ciphertext_sha256, encryption_key_reference, encryption_nonce, encryption_auth_tag)
     VALUES ('checkpoint-1', 'owner-1', 'session-1', 'run-1', 'thread-1', 1, 0, 1, $1, $2, 'secret://checkpoint/key-1', $3, $4)`,
    [
      Buffer.from('encrypted-fixture'),
      Buffer.alloc(32, 5),
      Buffer.alloc(12, 6),
      Buffer.alloc(16, 7),
    ],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_compaction"
     (compaction_id, owner_id, session_id, run_id, mode, covered_from_sequence, covered_through_sequence, summary_event_row_id, summary_event_type, model, catalog_generation, input_tokens, output_tokens, retained_invariants, state, completed_at)
     VALUES ('compact-1', 'owner-1', 'session-1', 'run-1', 'forced', 0, 1, $1, 'compaction', 'fixture/model-v1', 1, 10, 2, '[]'::jsonb, 'Committed', CURRENT_TIMESTAMP)`,
    [eventRowId],
  );
  const toolRows = (await dataSource.query(
    `INSERT INTO "${schema}"."assistant_tool_execution"
     (owner_id, execution_id, session_id, run_id, turn_id, binding_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, result_payload, result_hash, acknowledged_at, completed_at)
     VALUES ('owner-1', 'execution-1', 'session-1', 'run-1', 'turn-1', 'binding-1', 'local', 'read_file', $1, 1, $2, $3::jsonb, 'safe_retry', 0, 'Completed', $4::jsonb, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING execution_row_id`,
    [
      Buffer.alloc(32, 8),
      Buffer.alloc(32, 9),
      JSON.stringify({ toolName: 'read_file', relativePath: 'README.md' }),
      JSON.stringify({ status: 'completed', sha256: 'b'.repeat(64) }),
      Buffer.alloc(32, 10),
    ],
  )) as Array<{ execution_row_id: string }>;
  const toolRowId = toolRows[0]?.execution_row_id;
  expect(toolRowId).toBeDefined();

  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_interrupt"
     (interrupt_id, owner_id, session_id, run_id, tool_execution_row_id, checkpoint_id, interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders)
     VALUES ('interrupt-1', 'owner-1', 'session-1', 'run-1', $1, 'checkpoint-1', 'question', $2::jsonb, $3, $4::jsonb, $5::jsonb, $6::jsonb)`,
    [
      toolRowId,
      JSON.stringify({ prompt: 'Continue?' }),
      Buffer.alloc(32, 11),
      JSON.stringify({ type: 'text' }),
      JSON.stringify({ mode: 'plain' }),
      JSON.stringify(['binding-1']),
    ],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_artifact"
     (artifact_id, owner_id, session_id, run_id, tool_execution_row_id, kind, mime_type, content_sha256, byte_size, storage_reference_id)
     VALUES ('artifact-1', 'owner-1', 'session-1', 'run-1', $1, 'text', 'text/plain', $2, 7, 'storage://artifact-1')`,
    [toolRowId, Buffer.alloc(32, 12)],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_artifact_reference"
     (reference_id, owner_id, artifact_id, session_id, run_id, event_row_id, tool_execution_row_id, reference_kind)
     VALUES ('reference-1', 'owner-1', 'artifact-1', 'session-1', 'run-1', $1, $2, 'tool_result')`,
    [eventRowId, toolRowId],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_memory_operation"
     (operation_id, owner_id, session_id, source_session_id, run_id, scope_kind, operation, request_hash, request_payload, state, result_reference, completed_at)
     VALUES ('memory-1', 'owner-1', 'session-1', 'session-1', 'run-1', 'session', 'extract', $1, $2::jsonb, 'completed', 'mem0://operation-1', CURRENT_TIMESTAMP)`,
    [Buffer.alloc(32, 13), JSON.stringify({ source: 'turn-1' })],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_memory_operation_source"
     (operation_id, event_row_id, owner_id, source_session_id, source_run_id, sequence)
     VALUES ('memory-1', $1, 'owner-1', 'session-1', 'run-1', 1)`,
    [eventRowId],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_memory_operation"
     (operation_id, owner_id, session_id, source_session_id, run_id, scope_kind, operation, request_hash, request_payload, state, result_reference, completed_at)
     VALUES ('memory-owner-extract', 'owner-1', NULL, 'session-1', 'run-1', 'owner', 'extract', $1, '{}'::jsonb, 'completed', 'mem0://owner-operation-1', CURRENT_TIMESTAMP)`,
    [Buffer.alloc(32, 44)],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_memory_operation_source"
     (operation_id, event_row_id, owner_id, source_session_id, source_run_id, sequence)
     VALUES ('memory-owner-extract', $1, 'owner-1', 'session-1', 'run-1', 1)`,
    [eventRowId],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_deletion_receipt"
     (deletion_id, owner_id, session_id, resource_version, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, requested_at, completed_at)
     VALUES ('deletion-1', 'owner-1', 'session-1', 0, 1, 'correlation-delete-1', 'completed', $1, $2::jsonb, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [Buffer.alloc(32, 14), JSON.stringify(completedDeletionSteps), Buffer.alloc(32, 15)],
  );
  await dataSource.query(
    `INSERT INTO "${schema}"."assistant_audit_record"
     (audit_id, owner_id, session_id, run_id, tool_execution_row_id, actor_type, actor_id, action, target_type, target_id, result_class, decision_kind, authorization_decision, policy_id, policy_version, correlation_id, request_id, reason_code, redacted_metadata, metadata_sha256, occurred_at)
     VALUES ('audit-1', 'owner-1', 'session-1', 'run-1', $1, 'user', 'owner-1', 'authorization', 'session', 'session-1', 'denied', 'authorization', 'denied', 'policy-1', 0, 'correlation-audit-1', 'request-1', 'OWNER_DENIED', '{}'::jsonb, $2, CURRENT_TIMESTAMP)`,
    [toolRowId, Buffer.alloc(32, 16)],
  );
};

describe.sequential('AssistantRuntime compiled PostgreSQL migrations', () => {
  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.query('DROP TABLE IF EXISTS "assistant_runtime_migrations"');
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.query('DROP TABLE IF EXISTS "assistant_runtime_migrations"');
      await dataSource.destroy();
    }
  });

  it('creates the seven 4.1 core tables and fifteen 4.2 extension tables', async () => {
    expect(await tableNames()).toEqual(expectedTables);

    const timestampColumns = (await dataSource.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = $1 AND column_name IN ('created_at', 'updated_at', 'started_at', 'finished_at', 'accepted_at', 'claimed_at', 'consumed_at')`,
      [schema],
    )) as Array<{ data_type: string }>;
    expect(timestampColumns.length).toBeGreaterThanOrEqual(15);
    expect(
      timestampColumns.every(column => column.data_type === 'timestamp with time zone'),
    ).toBe(true);

    const extensionOwnership = (await dataSource.query(
      `SELECT column_name, count(DISTINCT table_name)::int AS table_count
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = ANY($2::text[])
         AND column_name IN ('owner_id', 'schema_version')
       GROUP BY column_name
       ORDER BY column_name`,
      [schema, expectedExtensionTables],
    )) as Array<{ column_name: string; table_count: number }>;
    expect(extensionOwnership).toEqual([
      { column_name: 'owner_id', table_count: 15 },
      { column_name: 'schema_version', table_count: 14 },
    ]);

    const protectedColumnTypes = (await dataSource.query(
      `SELECT data_type, count(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = ANY($2::text[])
         AND data_type IN ('bytea', 'jsonb')
       GROUP BY data_type
       ORDER BY data_type`,
      [schema, expectedExtensionTables],
    )) as Array<{ data_type: string; column_count: number }>;
    expect(
      protectedColumnTypes.find(row => row.data_type === 'bytea')?.column_count,
    ).toBeGreaterThan(10);
    expect(
      protectedColumnTypes.find(row => row.data_type === 'jsonb')?.column_count,
    ).toBeGreaterThan(10);

    const foreignSchemas = (await dataSource.query(
      `SELECT DISTINCT target_ns.nspname AS schema_name
       FROM pg_constraint constraint_record
       JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
       JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
       JOIN pg_class target_table ON target_table.oid = constraint_record.confrelid
       JOIN pg_namespace target_ns ON target_ns.oid = target_table.relnamespace
       WHERE constraint_record.contype = 'f' AND source_ns.nspname = $1`,
      [schema],
    )) as Array<{ schema_name: string }>;
    expect(foreignSchemas).toEqual([{ schema_name: schema }]);

    const foreignKeyDefinitions = (await dataSource.query(
      `SELECT pg_get_constraintdef(constraint_record.oid) AS definition
       FROM pg_constraint constraint_record
       JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
       JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
       WHERE constraint_record.contype = 'f' AND source_ns.nspname = $1`,
      [schema],
    )) as Array<{ definition: string }>;
    expect(foreignKeyDefinitions.length).toBeGreaterThan(20);
    expect(foreignKeyDefinitions.every(row => row.definition.includes('owner_id'))).toBe(
      true,
    );

    const retainedEvidenceForeignKeys = (await dataSource.query(
      `SELECT count(*)::int AS foreign_key_count
       FROM pg_constraint constraint_record
       JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
       JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
       WHERE constraint_record.contype = 'f'
         AND source_ns.nspname = $1
         AND source_table.relname IN ('assistant_deletion_receipt', 'assistant_audit_record')`,
      [schema],
    )) as Array<{ foreign_key_count: number }>;
    expect(retainedEvidenceForeignKeys[0]?.foreign_key_count).toBe(0);

    const requiredColumns = (await dataSource.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = $1
         AND (table_name, column_name) IN (
           ('assistant_context_snapshot', 'lifecycle_state'),
           ('assistant_context_snapshot', 'content_artifact_reference_id'),
           ('assistant_mcp_connection', 'enabled'),
           ('assistant_mcp_connection', 'revoked_at'),
           ('assistant_client_binding', 'lease_version'),
           ('assistant_outbox', 'claimed_by'),
           ('assistant_tool_execution', 'tool_version'),
           ('assistant_tool_execution', 'error_message'),
           ('assistant_tool_execution', 'retryable'),
           ('assistant_tool_execution', 'rejection_reason'),
           ('assistant_tool_execution', 'current_content_hash'),
           ('assistant_tool_execution', 'result_unknown_reason'),
           ('assistant_tool_execution', 'may_have_side_effects'),
           ('assistant_tool_execution', 'cancellation_outcome'),
           ('assistant_interrupt', 'resolution_reason'),
           ('assistant_memory_operation', 'source_session_id'),
           ('assistant_memory_operation_source', 'source_session_id'),
           ('assistant_memory_operation_source', 'source_run_id')
         )
       ORDER BY table_name, column_name`,
      [schema],
    )) as Array<{ table_name: string; column_name: string }>;
    expect(requiredColumns).toHaveLength(18);

    const contextArtifactForeignKey = (await dataSource.query(
      `SELECT pg_get_constraintdef(constraint_record.oid) AS definition
       FROM pg_constraint constraint_record
       JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
       JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
       WHERE constraint_record.contype = 'f'
         AND source_ns.nspname = $1
         AND source_table.relname = 'assistant_context_snapshot'
         AND pg_get_constraintdef(constraint_record.oid) LIKE '%content_artifact_reference_id%'`,
      [schema],
    )) as Array<{ definition: string }>;
    expect(contextArtifactForeignKey).toHaveLength(1);
    expect(contextArtifactForeignKey[0]?.definition).toContain(
      'assistant_artifact_reference(reference_id, owner_id)',
    );
  });

  it('accepts one complete owner-scoped Session-to-steer chain', async () => {
    await insertLegalChain();
    const counts = (await dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM "${schema}"."assistant_session") AS sessions,
        (SELECT count(*)::int FROM "${schema}"."assistant_run") AS runs,
        (SELECT count(*)::int FROM "${schema}"."assistant_steer_command") AS steers`,
    )) as Array<{ sessions: number; runs: number; steers: number }>;
    expect(counts[0]).toEqual({ sessions: 1, runs: 1, steers: 1 });
  });

  it('accepts one complete owner-scoped 4.2 durability chain', async () => {
    await insertLegalExtensionChain();
    const counts = (await dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM "${schema}"."assistant_event") AS events,
        (SELECT count(*)::int FROM "${schema}"."assistant_checkpoint") AS checkpoints,
        (SELECT count(*)::int FROM "${schema}"."assistant_tool_execution") AS tools,
        (SELECT count(*)::int FROM "${schema}"."assistant_artifact_reference") AS artifact_references,
        (SELECT count(*)::int FROM "${schema}"."assistant_deletion_receipt") AS deletion_receipts,
        (SELECT count(*)::int FROM "${schema}"."assistant_audit_record") AS audit_records`,
    )) as Array<{
      events: number;
      checkpoints: number;
      tools: number;
      artifact_references: number;
      deletion_receipts: number;
      audit_records: number;
    }>;
    expect(counts[0]).toEqual({
      events: 1,
      checkpoints: 1,
      tools: 1,
      artifact_references: 1,
      deletion_receipts: 1,
      audit_records: 1,
    });
  });

  it('rejects invalid versions, hashes, states and completion shapes', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_session"
         (session_id, owner_id, resource_version, title)
         VALUES ('session-bad-version', 'owner-1', -1, 'Bad')`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_command"
         (owner_id, command_id, session_id, command_type, request_hash, correlation_id, state, result_resource_version, completed_at)
         VALUES ('owner-1', 'command-negative-result-version', 'session-1', 'stop', $1, 'correlation-3', 'Completed', -1, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 4)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_command"
         (owner_id, command_id, session_id, command_type, request_hash, correlation_id)
         VALUES ('owner-1', 'command-short-hash', 'session-1', 'stop', $1, 'correlation-2')`,
        [Buffer.alloc(31, 1)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_settings"
         (settings_id, owner_id, scope_kind, session_id)
         VALUES ('settings-missing-model', 'owner-1', 'Session', 'session-1')`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_run"
         (run_id, owner_id, session_id, state, settings_version, provider_connection_id, model)
         VALUES ('run-bad-state', 'owner-1', 'session-1', 'Paused', 0, 'provider-1', 'fixture/model')`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_run"
         (run_id, owner_id, session_id, state, settings_version, provider_connection_id, model)
         VALUES ('run-terminal-no-time', 'owner-1', 'session-1', 'Succeeded', 0, 'provider-1', 'fixture/model')`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_model_attempt"
         (attempt_id, owner_id, turn_id, ordinal, attempt_state, finished_at)
         VALUES ('attempt-no-outcome', 'owner-1', 'turn-1', 1, 'Finished', CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_steer_command"
         (steer_id, owner_id, run_id, source_command_row_id, accepted_ordinal, input_text, state, consumed_at)
         VALUES ('steer-bad-state', 'owner-1', 'run-1', 1, 1, 'bad state', 'Pending', CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toThrow();
  });

  it('rejects missing Session scope and every tested cross-owner reference', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_settings"
         (settings_id, owner_id, scope_kind, session_id)
         VALUES ('settings-missing-session', 'owner-1', 'Session', NULL)`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_settings"
         (settings_id, owner_id, scope_kind, session_id)
         VALUES ('settings-foreign', 'owner-2', 'Session', 'session-1')`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_turn"
         (turn_id, owner_id, run_id, ordinal, input_event_sequence)
         VALUES ('turn-foreign', 'owner-2', 'run-1', 1, 1)`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_model_attempt"
         (attempt_id, owner_id, turn_id, ordinal, attempt_state)
         VALUES ('attempt-foreign', 'owner-2', 'turn-1', 1, 'Started')`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_steer_command"
         (steer_id, owner_id, run_id, source_command_row_id, accepted_ordinal, input_text)
         VALUES ('steer-foreign', 'owner-2', 'run-1', 1, 1, 'foreign')`,
      ),
    ).rejects.toThrow();
  });

  it('supports forked artifact references and rejects invalid 4.2 ownership, lineage and lifecycle shapes', async () => {
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_session"
       (session_id, owner_id, title) VALUES ('session-2', 'owner-1', 'Other fixture session')`,
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_run"
       (run_id, owner_id, session_id, state, settings_version, provider_connection_id, model, started_at)
       VALUES ('run-2', 'owner-1', 'session-2', 'Running', 0, 'provider-1', 'fixture/model-v1', CURRENT_TIMESTAMP)`,
    );
    const sessionTwoEventRows = (await dataSource.query(
      `INSERT INTO "${schema}"."assistant_event"
       (owner_id, event_id, session_id, run_id, sequence, event_type, payload, payload_sha256, occurred_at)
       VALUES ('owner-1', 'event-session-2-message', 'session-2', 'run-2', 1, 'message', '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP)
       RETURNING event_row_id`,
      [Buffer.alloc(32, 43)],
    )) as Array<{ event_row_id: string }>;
    const sessionTwoMessageEventRowId = sessionTwoEventRows[0]?.event_row_id;
    expect(sessionTwoMessageEventRowId).toBeDefined();

    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_run"
       (run_id, owner_id, session_id, state, settings_version, provider_connection_id, model, started_at, finished_at)
       VALUES ('run-same-session-2', 'owner-1', 'session-1', 'Succeeded', 0, 'provider-1', 'fixture/model-v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    const otherRunEventRows = (await dataSource.query(
      `INSERT INTO "${schema}"."assistant_event"
       (owner_id, event_id, session_id, run_id, sequence, event_type, payload, payload_sha256, occurred_at)
       VALUES ('owner-1', 'event-other-run', 'session-1', 'run-same-session-2', 2, 'message', '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP)
       RETURNING event_row_id`,
      [Buffer.alloc(32, 66)],
    )) as Array<{ event_row_id: string }>;
    const otherRunEventRowId = otherRunEventRows[0]?.event_row_id;
    expect(otherRunEventRowId).toBeDefined();

    // 即使 owner 和 Session 相同，provenance event 也必须属于 operation 声明的 source Run。
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_memory_operation_source"
         (operation_id, event_row_id, owner_id, source_session_id, source_run_id, sequence)
         VALUES ('memory-owner-extract', $1, 'owner-1', 'session-1', 'run-1', 2)`,
        [otherRunEventRowId],
      ),
    ).rejects.toThrow();

    // Compaction 只能引用 compaction 事件，不能把普通 message 冒充摘要提交事件。
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_compaction"
         (compaction_id, owner_id, session_id, run_id, mode, covered_from_sequence, covered_through_sequence, summary_event_row_id, summary_event_type, model, input_tokens, output_tokens, retained_invariants, state, completed_at)
         VALUES ('compact-message-summary', 'owner-1', 'session-2', 'run-2', 'forced', 0, 1, $1, 'compaction', 'fixture/model-v1', 1, 1, '[]'::jsonb, 'Committed', CURRENT_TIMESTAMP)`,
        [sessionTwoMessageEventRowId],
      ),
    ).rejects.toThrow();

    // Mem0 provenance 必须和 operation 保持同一 Session，不能挂接任意事件行。
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_memory_operation_source"
         (operation_id, event_row_id, owner_id, source_session_id, source_run_id, sequence)
         VALUES ('memory-1', $1, 'owner-1', 'session-2', 'run-2', 1)`,
        [sessionTwoMessageEventRowId],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_memory_operation"
         (operation_id, owner_id, session_id, source_session_id, run_id, scope_kind, operation, request_hash, request_payload)
         VALUES ('memory-session-cross-source', 'owner-1', 'session-1', 'session-2', 'run-2', 'session', 'extract', $1, '{}'::jsonb)`,
        [Buffer.alloc(32, 45)],
      ),
    ).rejects.toThrow();
    const fractionalRemainingSteps = completedDeletionSteps.map(step => ({ ...step }));
    const fractionalRemainingArtifact = fractionalRemainingSteps.find(
      step => step.step === 'artifact_blobs',
    );
    if (fractionalRemainingArtifact !== undefined) {
      fractionalRemainingArtifact.disposition = 'preserved';
      fractionalRemainingArtifact.reason = 'shared_blob_reference';
      fractionalRemainingArtifact.remainingArtifactReferences = 1.5;
    }
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_deletion_receipt"
         (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, requested_at, completed_at)
         VALUES ('deletion-fractional-remaining', 'owner-1', 'session-1', 1, 'correlation-delete-fractional-remaining', 'completed', $1, $2::jsonb, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          Buffer.alloc(32, 67),
          JSON.stringify(fractionalRemainingSteps),
          Buffer.alloc(32, 68),
        ],
      ),
    ).rejects.toThrow();
    const emptyCleanupSteps = completedDeletionSteps.map(step => ({ ...step }));
    const emptyCleanupStep = emptyCleanupSteps.find(
      step => step.step === 'redis_projection',
    );
    if (emptyCleanupStep !== undefined) {
      emptyCleanupStep.disposition = 'retryable_failure';
      emptyCleanupStep.failureCode = 'REDIS_UNAVAILABLE';
      emptyCleanupStep.cleanupReferenceId = '';
    }
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_deletion_receipt"
         (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, retry_cleanup_reference_id, requested_at, completed_at)
         VALUES ('deletion-empty-cleanup', 'owner-1', 'session-1', 1, 'correlation-delete-empty-cleanup', 'partial_failure', $1, $2::jsonb, $3, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 69), JSON.stringify(emptyCleanupSteps), Buffer.alloc(32, 70)],
      ),
    ).rejects.toThrow();
    const validCleanupSteps = completedDeletionSteps.map(step => ({ ...step }));
    const validCleanupStep = validCleanupSteps.find(
      step => step.step === 'redis_projection',
    );
    if (validCleanupStep !== undefined) {
      validCleanupStep.disposition = 'retryable_failure';
      validCleanupStep.failureCode = 'REDIS_UNAVAILABLE';
      validCleanupStep.cleanupReferenceId = 'cleanup-valid-1';
    }
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_deletion_receipt"
       (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, retry_cleanup_reference_id, requested_at, completed_at)
       VALUES ('deletion-valid-cleanup', 'owner-1', 'session-1', 1, 'correlation-delete-valid-cleanup', 'partial_failure', $1, $2::jsonb, $3, 'cleanup-valid-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 71), JSON.stringify(validCleanupSteps), Buffer.alloc(32, 72)],
    );
    // Fork 只复制 reference；immutable blob/artifact 仍由同 owner 共享。
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_artifact_reference"
       (reference_id, owner_id, artifact_id, session_id, run_id, reference_kind)
       VALUES ('reference-fork', 'owner-1', 'artifact-1', 'session-2', 'run-2', 'fork')`,
    );
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_event"
         (owner_id, event_id, session_id, run_id, sequence, event_type, payload, payload_sha256, occurred_at)
         VALUES ('owner-1', 'event-cross-session', 'session-1', 'run-2', 2, 'message', '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 17)],
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_tool_execution"
       (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token)
       VALUES ('owner-1', 'execution-runtime', 'session-1', 'run-1', 'runtime', 'context_budget', $1, 1, $2, '{}'::jsonb, 'safe_retry', 0)`,
      [Buffer.alloc(32, 31), Buffer.alloc(32, 32)],
    );
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_tool_execution"
         (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, completed_at)
         VALUES ('owner-1', 'execution-unknown-without-reason', 'session-1', 'run-1', 'runtime', 'context_budget', $1, 1, $2, '{}'::jsonb, 'never_automatic_retry', 0, 'ResultUnknown', CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 33), Buffer.alloc(32, 34)],
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_tool_execution"
       (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, error_message, current_content_hash, completed_at)
       VALUES ('owner-1', 'execution-conflict', 'session-1', 'run-1', 'runtime', 'apply_patch', $1, 1, $2, '{}'::jsonb, 'retry_with_precondition', 0, 'Conflict', 'workspace content changed', $3, CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 46), Buffer.alloc(32, 47), Buffer.alloc(32, 48)],
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_tool_execution"
       (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, rejection_reason, completed_at)
       VALUES ('owner-1', 'execution-rejected', 'session-1', 'run-1', 'runtime', 'apply_patch', $1, 1, $2, '{}'::jsonb, 'never_automatic_retry', 0, 'Rejected', 'policy rejected this operation', CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 49), Buffer.alloc(32, 50)],
    );
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_tool_execution"
         (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, completed_at)
         VALUES ('owner-1', 'execution-conflict-no-message', 'session-1', 'run-1', 'runtime', 'apply_patch', $1, 1, $2, '{}'::jsonb, 'retry_with_precondition', 0, 'Conflict', CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 51), Buffer.alloc(32, 52)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_tool_execution"
         (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, error_message, current_content_hash, completed_at)
         VALUES ('owner-1', 'execution-conflict-bad-hash', 'session-1', 'run-1', 'runtime', 'apply_patch', $1, 1, $2, '{}'::jsonb, 'retry_with_precondition', 0, 'Conflict', 'changed', $3, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 53), Buffer.alloc(32, 54), Buffer.alloc(31, 55)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_tool_execution"
         (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, completed_at)
         VALUES ('owner-1', 'execution-rejected-no-reason', 'session-1', 'run-1', 'runtime', 'apply_patch', $1, 1, $2, '{}'::jsonb, 'never_automatic_retry', 0, 'Rejected', CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 56), Buffer.alloc(32, 57)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_event"
         (owner_id, event_id, session_id, sequence, event_type, payload, payload_sha256, occurred_at)
         VALUES ('owner-2', 'event-cross-owner', 'session-1', 2, 'message', '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 18)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_interrupt"
         (interrupt_id, owner_id, session_id, run_id, checkpoint_id, interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders, state, resolution_kind, responder_binding_id, resolution_command_id, resolution_idempotency_key, resolved_at)
         VALUES ('interrupt-question-approved', 'owner-1', 'session-1', 'run-1', 'checkpoint-1', 'question', '{}'::jsonb, $1, '{}'::jsonb, '{}'::jsonb, '["binding-1"]'::jsonb, 'Approved', 'approve', 'binding-1', 'command-answer-1', 'idem-answer-1', CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 35)],
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_interrupt"
       (interrupt_id, owner_id, session_id, run_id, checkpoint_id, interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders, state, resolution_kind, responder_binding_id, resolution_command_id, resolution_idempotency_key, resolution_reason, resolved_at)
       VALUES ('interrupt-question-cancel-1025', 'owner-1', 'session-1', 'run-1', 'checkpoint-1', 'question', '{}'::jsonb, $1, '{}'::jsonb, '{}'::jsonb, '["binding-1"]'::jsonb, 'Cancelled', 'cancel', 'binding-1', 'command-cancel-1025', 'idem-cancel-1025', $2, CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 58), 'q'.repeat(1025)],
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_interrupt"
       (interrupt_id, owner_id, session_id, run_id, checkpoint_id, interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders, state, resolution_kind, responder_binding_id, resolution_command_id, resolution_idempotency_key, resolution_reason, resolved_at)
       VALUES ('interrupt-approval-reject-4096', 'owner-1', 'session-1', 'run-1', 'checkpoint-1', 'approval', '{}'::jsonb, $1, '{}'::jsonb, '{}'::jsonb, '["binding-1"]'::jsonb, 'Rejected', 'reject', 'binding-1', 'command-reject-4096', 'idem-reject-4096', $2, CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 59), 'r'.repeat(4096)],
    );
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_interrupt"
         (interrupt_id, owner_id, session_id, run_id, checkpoint_id, interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders, state, resolution_kind, responder_binding_id, resolution_command_id, resolution_idempotency_key, resolved_at)
         VALUES ('interrupt-rejected-no-reason', 'owner-1', 'session-1', 'run-1', 'checkpoint-1', 'approval', '{}'::jsonb, $1, '{}'::jsonb, '{}'::jsonb, '["binding-1"]'::jsonb, 'Rejected', 'reject', 'binding-1', 'command-answer-2', 'idem-answer-2', CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 36)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_tool_execution"
         (owner_id, execution_id, session_id, run_id, binding_id, mcp_connection_id, location, tool_name, tool_schema_hash, catalog_generation, attempt, request_hash, request_payload, idempotency_class, fencing_token)
         VALUES ('owner-1', 'execution-bad-location', 'session-1', 'run-1', 'binding-1', 'mcp-1', 'remote_mcp', 'bad', $1, 1, 1, $2, '{}'::jsonb, 'safe_retry', 0)`,
        [Buffer.alloc(32, 19), Buffer.alloc(32, 20)],
      ),
    ).rejects.toThrow();

    const forgedCompletedSteps = completedDeletionSteps.map(step => ({ ...step }));
    const postgresStep = forgedCompletedSteps.find(
      step => step.step === 'postgres_session_data',
    );
    if (postgresStep !== undefined) {
      postgresStep.disposition = 'preserved';
      postgresStep.reason = 'not_deleted';
    }
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_deletion_receipt"
         (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, requested_at, completed_at)
         VALUES ('deletion-forged-complete', 'owner-1', 'session-1', 1, 'correlation-delete-3', 'completed', $1, $2::jsonb, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          Buffer.alloc(32, 37),
          JSON.stringify(forgedCompletedSteps),
          Buffer.alloc(32, 38),
        ],
      ),
    ).rejects.toThrow();

    const malformedRetrySteps = completedDeletionSteps.map(step => ({ ...step }));
    const redisStep = malformedRetrySteps.find(step => step.step === 'redis_projection');
    if (redisStep !== undefined) redisStep.disposition = 'retryable_failure';
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_deletion_receipt"
         (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, retry_cleanup_reference_id, requested_at, completed_at)
         VALUES ('deletion-malformed-retry', 'owner-1', 'session-1', 1, 'correlation-delete-4', 'partial_failure', $1, $2::jsonb, $3, 'cleanup-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 39), JSON.stringify(malformedRetrySteps), Buffer.alloc(32, 40)],
      ),
    ).rejects.toThrow();

    const sharedBlobSteps = completedDeletionSteps.map(step => ({ ...step }));
    const artifactBlobStep = sharedBlobSteps.find(step => step.step === 'artifact_blobs');
    if (artifactBlobStep !== undefined) {
      artifactBlobStep.disposition = 'preserved';
      artifactBlobStep.reason = 'shared_blob_reference';
      artifactBlobStep.remainingArtifactReferences = 1;
    }
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_deletion_receipt"
       (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, requested_at, completed_at)
       VALUES ('deletion-shared-blob', 'owner-1', 'session-1', 1, 'correlation-delete-5', 'completed', $1, $2::jsonb, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 41), JSON.stringify(sharedBlobSteps), Buffer.alloc(32, 42)],
    );
    const offsetDeletionSteps = completedDeletionSteps.map(step => ({
      ...step,
      completedAt: '2026-10-05T20:00:00.123456+08:00',
    }));
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_deletion_receipt"
       (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, requested_at, completed_at)
       VALUES ('deletion-valid-offset', 'owner-1', 'session-1', 1, 'correlation-delete-offset', 'completed', $1, $2::jsonb, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 60), JSON.stringify(offsetDeletionSteps), Buffer.alloc(32, 61)],
    );
    const invalidCalendarSteps = completedDeletionSteps.map(step => ({ ...step }));
    invalidCalendarSteps[0] = {
      ...invalidCalendarSteps[0]!,
      completedAt: '2026-02-30T12:00:00Z',
    };
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_deletion_receipt"
         (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, requested_at, completed_at)
         VALUES ('deletion-invalid-calendar', 'owner-1', 'session-1', 1, 'correlation-delete-calendar', 'completed', $1, $2::jsonb, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          Buffer.alloc(32, 62),
          JSON.stringify(invalidCalendarSteps),
          Buffer.alloc(32, 63),
        ],
      ),
    ).rejects.toThrow();
    const fractionalAttemptSteps = completedDeletionSteps.map(step => ({ ...step }));
    fractionalAttemptSteps[0] = { ...fractionalAttemptSteps[0]!, attempt: 1.5 };
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_deletion_receipt"
         (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, requested_at, completed_at)
         VALUES ('deletion-fractional-step-attempt', 'owner-1', 'session-1', 1, 'correlation-delete-fractional', 'completed', $1, $2::jsonb, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          Buffer.alloc(32, 64),
          JSON.stringify(fractionalAttemptSteps),
          Buffer.alloc(32, 65),
        ],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_memory_operation"
         (operation_id, owner_id, session_id, scope_kind, operation, request_hash, request_payload)
         VALUES ('memory-bad-scope', 'owner-1', 'session-1', 'owner', 'recall', $1, '{}'::jsonb)`,
        [Buffer.alloc(32, 21)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_compaction"
         (compaction_id, owner_id, session_id, mode, covered_from_sequence, covered_through_sequence, model, input_tokens, output_tokens, retained_invariants, state, completed_at)
         VALUES ('compact-no-summary', 'owner-1', 'session-1', 'forced', 0, 1, 'fixture/model', 1, 1, '[]'::jsonb, 'Completed', CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_mcp_connection"
         (connection_id, owner_id, display_name, endpoint, auth_secret_reference)
         VALUES ('mcp-plaintext-secret', 'owner-1', 'Bad MCP', 'https://mcp.example.test', 'plaintext-secret')`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_deletion_receipt"
         (deletion_id, owner_id, session_id, attempt, correlation_id, status, confirmation_hash, steps, steps_sha256, requested_at, completed_at)
         VALUES ('deletion-missing-steps', 'owner-1', 'deleted-session', 1, 'correlation-delete-2', 'completed', $1, '[]'::jsonb, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 22), Buffer.alloc(32, 23)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_audit_record"
         (audit_id, owner_id, actor_type, actor_id, action, target_type, result_class, decision_kind, stale_owner_id, current_owner_id, stale_fencing_token, current_fencing_token, policy_id, policy_version, correlation_id, request_id, reason_code, metadata_sha256, occurred_at)
         VALUES ('audit-stale-fence', 'owner-1', 'worker', 'worker-old', 'fenced_commit', 'run', 'denied', 'stale_fence_rejected', 'worker-old', 'worker-new', 4, 4, 'policy-1', 0, 'correlation-audit-2', 'request-2', 'STALE_FENCE', $1, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 24)],
      ),
    ).rejects.toThrow();
  });

  it('uses the 4.8 hot-path indexes within the documented 100 ms local planning budget', async () => {
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_session" (session_id, owner_id, title, updated_at)
       SELECT 'plan-session-' || value, 'owner-plan-' || (value % 100),
              'Plan ' || value, CURRENT_TIMESTAMP - (value || ' milliseconds')::interval
       FROM generate_series(1, 5000) AS value`,
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_event"
       (owner_id, event_id, session_id, sequence, event_type, payload, payload_sha256, occurred_at)
       SELECT 'owner-plan-1', 'plan-event-' || value, 'plan-session-1', value,
              'message', '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP
       FROM generate_series(1, 5000) AS value`,
      [Buffer.alloc(32, 81)],
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_outbox"
       (owner_id, session_id, topic, aggregate_type, aggregate_id,
        aggregate_sequence, payload, payload_sha256)
       SELECT 'owner-plan-1', 'plan-session-1', 'plan.event', 'session',
              'plan-session-1', value, '{}'::jsonb, $1
       FROM generate_series(1, 5000) AS value`,
      [Buffer.alloc(32, 82)],
    );
    await dataSource.query(`ANALYZE "${schema}"."assistant_session"`);
    await dataSource.query(`ANALYZE "${schema}"."assistant_event"`);
    await dataSource.query(`ANALYZE "${schema}"."assistant_outbox"`);
    await dataSource.query('SET enable_seqscan = off');

    const cases = [
      {
        index: 'ix_assistant_session_catalog',
        sql: `SELECT session_id FROM "${schema}"."assistant_session"
              WHERE owner_id = 'owner-plan-1' AND lifecycle_state = 'Active'
              ORDER BY updated_at DESC, session_id LIMIT 50`,
      },
      {
        // 4.5 的唯一索引已经覆盖 history cursor；4.8 不重复创建写放大索引。
        index: 'uq_assistant_event_session_sequence',
        sql: `SELECT event_row_id FROM "${schema}"."assistant_event"
              WHERE owner_id = 'owner-plan-1' AND session_id = 'plan-session-1'
                AND sequence < 4900 ORDER BY sequence DESC LIMIT 100`,
      },
      {
        index: 'ix_assistant_run_active',
        sql: `SELECT run_id FROM "${schema}"."assistant_run"
              WHERE owner_id = 'owner-1' AND state = 'Running' ORDER BY updated_at LIMIT 10`,
      },
      {
        index: 'ix_assistant_binding_expired_lease',
        sql: `SELECT binding_id FROM "${schema}"."assistant_client_binding"
              WHERE lifecycle_state = 'Active' AND lease_expires_at <= CURRENT_TIMESTAMP
              ORDER BY lease_expires_at LIMIT 10`,
      },
      {
        index: 'ix_assistant_tool_pending',
        sql: `SELECT execution_row_id FROM "${schema}"."assistant_tool_execution"
              WHERE owner_id = 'owner-1' AND state IN ('Pending', 'Dispatched', 'Acknowledged')
              ORDER BY created_at, execution_row_id LIMIT 10`,
      },
      {
        index: 'ix_assistant_interrupt_pending',
        sql: `SELECT interrupt_id FROM "${schema}"."assistant_interrupt"
              WHERE owner_id = 'owner-1' AND state = 'Pending'
              ORDER BY created_at, interrupt_id LIMIT 10`,
      },
      {
        index: 'ix_assistant_outbox_ready',
        sql: `SELECT outbox_row_id FROM "${schema}"."assistant_outbox"
              WHERE state IN ('Pending', 'RetryableFailure')
                AND available_at <= CURRENT_TIMESTAMP
              ORDER BY available_at, outbox_row_id LIMIT 100`,
      },
      {
        index: 'ix_assistant_outbox_stale_claim',
        sql: `SELECT outbox_row_id FROM "${schema}"."assistant_outbox"
              WHERE state = 'Claimed' AND claimed_at <= CURRENT_TIMESTAMP - interval '30 seconds'
              ORDER BY claimed_at, outbox_row_id LIMIT 100`,
      },
    ] as const;

    try {
      for (const queryCase of cases) {
        const rows = (await dataSource.query(
          `EXPLAIN (ANALYZE, FORMAT JSON) ${queryCase.sql}`,
        )) as Array<{
          'QUERY PLAN': Array<{
            'Planning Time': number;
            'Execution Time': number;
          }>;
        }>;
        const plan = rows[0]?.['QUERY PLAN'][0];
        expect(JSON.stringify(plan)).toContain(queryCase.index);
        expect(
          (plan?.['Planning Time'] ?? 100) + (plan?.['Execution Time'] ?? 100),
        ).toBeLessThan(100);
      }
    } finally {
      await dataSource.query('RESET enable_seqscan');
    }
  });

  it('enforces task 4.3 product identity, active/current and terminal-result uniqueness', async () => {
    const productConstraints = (await dataSource.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE connamespace = $1::regnamespace
         AND conname IN ('uq_assistant_command_owner_command', 'uq_assistant_event_session_sequence', 'uq_assistant_event_event_id')
       ORDER BY conname`,
      [schema],
    )) as Array<{ conname: string; definition: string }>;
    expect(productConstraints).toHaveLength(3);
    expect(productConstraints.map(row => row.conname)).toEqual([
      'uq_assistant_command_owner_command',
      'uq_assistant_event_event_id',
      'uq_assistant_event_session_sequence',
    ]);
    expect(
      productConstraints.find(row => row.conname === 'uq_assistant_command_owner_command')
        ?.definition,
    ).toContain('UNIQUE (owner_id, command_id)');
    expect(
      productConstraints.find(row => row.conname === 'uq_assistant_event_event_id')
        ?.definition,
    ).toContain('UNIQUE (event_id)');
    expect(
      productConstraints.find(
        row => row.conname === 'uq_assistant_event_session_sequence',
      )?.definition,
    ).toContain('UNIQUE (session_id, sequence)');

    const partialIndexes = (await dataSource.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = $1 AND indexname LIKE 'uq_assistant_%'
         AND indexdef ILIKE '% WHERE %'
       ORDER BY indexname`,
      [schema],
    )) as Array<{ indexname: string; indexdef: string }>;
    expect(partialIndexes.map(row => row.indexname)).toEqual([
      'uq_assistant_client_binding_current_epoch',
      'uq_assistant_interrupt_resolution_command',
      'uq_assistant_interrupt_resolution_idempotency',
      'uq_assistant_run_one_active_per_session',
      'uq_assistant_tool_execution_terminal_attempt',
    ]);
    expect(
      partialIndexes.find(
        row => row.indexname === 'uq_assistant_run_one_active_per_session',
      )?.indexdef,
    ).toContain('(session_id)');
    expect(
      partialIndexes.find(
        row => row.indexname === 'uq_assistant_tool_execution_terminal_attempt',
      )?.indexdef,
    ).toContain('(owner_id, execution_id, attempt)');
    expect(
      partialIndexes.find(
        row => row.indexname === 'uq_assistant_client_binding_current_epoch',
      )?.indexdef,
    ).toContain('(owner_id, cli_instance_id, workspace_id)');

    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_command"
         (owner_id, command_id, session_id, command_type, request_hash, correlation_id)
         VALUES ('owner-1', 'command-1', 'session-1', 'stop', $1, 'correlation-duplicate-command')`,
        [Buffer.alloc(32, 27)],
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_command"
       (owner_id, command_id, command_type, request_hash, correlation_id)
       VALUES ('owner-2', 'command-1', 'stop', $1, 'correlation-other-owner')`,
      [Buffer.alloc(32, 28)],
    );

    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_event"
         (owner_id, event_id, session_id, run_id, sequence, event_type, payload, payload_sha256, occurred_at)
         VALUES ('owner-1', 'event-duplicate-sequence', 'session-1', 'run-1', 1, 'message', '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 29)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_event"
         (owner_id, event_id, session_id, run_id, sequence, event_type, payload, payload_sha256, occurred_at)
         VALUES ('owner-1', 'event-1', 'session-2', 'run-2', 3, 'message', '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 30)],
      ),
    ).rejects.toThrow();

    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_run"
         (run_id, owner_id, session_id, state, settings_version, provider_connection_id, model, started_at)
         VALUES ('run-second-active', 'owner-1', 'session-1', 'WaitingForHuman', 0, 'provider-1', 'fixture/model-v1', CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_run"
       (run_id, owner_id, session_id, state, settings_version, provider_connection_id, model, started_at, finished_at)
       VALUES ('run-terminal-history', 'owner-1', 'session-1', 'Failed', 0, 'provider-1', 'fixture/model-v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );

    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_tool_execution"
         (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, result_payload, result_hash, completed_at)
         VALUES ('owner-1', 'execution-1', 'session-1', 'run-1', 'runtime', 'read_file', $1, 1, $2, '{}'::jsonb, 'safe_retry', 0, 'Completed', '{}'::jsonb, $3, CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 31), Buffer.alloc(32, 32), Buffer.alloc(32, 33)],
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_tool_execution"
       (owner_id, execution_id, session_id, run_id, location, tool_name, tool_schema_hash, attempt, request_hash, request_payload, idempotency_class, fencing_token, state, result_payload, result_hash, completed_at)
       VALUES ('owner-1', 'execution-1', 'session-1', 'run-1', 'runtime', 'read_file', $1, 2, $2, '{}'::jsonb, 'safe_retry', 0, 'Completed', '{}'::jsonb, $3, CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 34), Buffer.alloc(32, 35), Buffer.alloc(32, 36)],
    );

    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_interrupt"
       (interrupt_id, owner_id, session_id, run_id, checkpoint_id, interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders, state, resolution_kind, responder_binding_id, resolution_command_id, resolution_idempotency_key, resolved_at)
       VALUES ('interrupt-resolution-1', 'owner-1', 'session-1', 'run-1', 'checkpoint-1', 'approval', '{}'::jsonb, $1, '{}'::jsonb, '{}'::jsonb, '["binding-1"]'::jsonb, 'Approved', 'approve', 'binding-1', 'resolution-command-1', 'resolution-idem-1', CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 37)],
    );
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_interrupt"
         (interrupt_id, owner_id, session_id, run_id, checkpoint_id, interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders, state, resolution_kind, responder_binding_id, resolution_command_id, resolution_idempotency_key, resolved_at)
         VALUES ('interrupt-resolution-command-conflict', 'owner-1', 'session-1', 'run-1', 'checkpoint-1', 'approval', '{}'::jsonb, $1, '{}'::jsonb, '{}'::jsonb, '["binding-1"]'::jsonb, 'Approved', 'approve', 'binding-1', 'resolution-command-1', 'resolution-idem-2', CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 38)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_interrupt"
         (interrupt_id, owner_id, session_id, run_id, checkpoint_id, interrupt_type, prompt_payload, prompt_hash, answer_format, display_policy, allowed_responders, state, resolution_kind, responder_binding_id, resolution_command_id, resolution_idempotency_key, resolved_at)
         VALUES ('interrupt-resolution-idem-conflict', 'owner-1', 'session-1', 'run-1', 'checkpoint-1', 'approval', '{}'::jsonb, $1, '{}'::jsonb, '{}'::jsonb, '["binding-1"]'::jsonb, 'Approved', 'approve', 'binding-1', 'resolution-command-2', 'resolution-idem-1', CURRENT_TIMESTAMP)`,
        [Buffer.alloc(32, 39)],
      ),
    ).rejects.toThrow();

    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_client_binding"
         (binding_id, owner_id, session_id, cli_instance_id, workspace_id, workspace_fingerprint, stream_secret_reference, capabilities, approval_policy, lease_expires_at, lifecycle_state)
         VALUES ('binding-current-conflict', 'owner-1', 'session-1', 'cli-1', 'workspace-1', $1, 'secret://binding/current-conflict', '["file_read"]'::jsonb, '{}'::jsonb, CURRENT_TIMESTAMP + interval '5 minutes', 'Offline')`,
        [Buffer.alloc(32, 40)],
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `UPDATE "${schema}"."assistant_client_binding"
       SET lifecycle_state = 'Replaced', replaced_at = CURRENT_TIMESTAMP
       WHERE binding_id = 'binding-1'`,
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_client_binding"
       (binding_id, owner_id, session_id, cli_instance_id, workspace_id, workspace_fingerprint, stream_secret_reference, capabilities, approval_policy, lease_expires_at)
       VALUES ('binding-current-2', 'owner-1', 'session-1', 'cli-1', 'workspace-1', $1, 'secret://binding/current-2', '["file_read"]'::jsonb, '{}'::jsonb, CURRENT_TIMESTAMP + interval '5 minutes')`,
      [Buffer.alloc(32, 41)],
    );
  });

  it('backfills continuous history and removes every 4.5 column and constraint on down', async () => {
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_session" (session_id, owner_id, title)
       VALUES ('session-backfill', 'owner-backfill', 'Backfill fixture')`,
    );
    const eventRows = (await dataSource.query(
      `INSERT INTO "${schema}"."assistant_event"
       (owner_id, event_id, session_id, sequence, event_type, payload, payload_sha256, occurred_at)
       VALUES
        ('owner-backfill', 'event-backfill-1', 'session-backfill', 1, 'message', '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP),
        ('owner-backfill', 'event-backfill-2', 'session-backfill', 2, 'message', '{"type":"message"}'::jsonb, $2, CURRENT_TIMESTAMP)
       RETURNING event_row_id, sequence`,
      [Buffer.alloc(32, 43), Buffer.alloc(32, 44)],
    )) as Array<{ event_row_id: string; sequence: string }>;
    expect(await dataSource.runMigrations()).toHaveLength(2);

    const [session] = (await dataSource.query(
      `SELECT next_event_sequence, active_head_sequence
       FROM "${schema}"."assistant_session" WHERE session_id = 'session-backfill'`,
    )) as Array<Record<string, string>>;
    expect(session).toEqual({ next_event_sequence: '3', active_head_sequence: '2' });
    const constraints = (await dataSource.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE connamespace = $1::regnamespace
         AND conname IN (
           'fk_assistant_session_active_head',
           'fk_assistant_run_current_checkpoint_lineage',
           'uq_assistant_outbox_topic_aggregate_sequence'
         )
       ORDER BY conname`,
      [schema],
    )) as Array<{ conname: string; definition: string }>;
    expect(constraints).toEqual([
      {
        conname: 'fk_assistant_run_current_checkpoint_lineage',
        definition: expect.stringContaining(
          'FOREIGN KEY (current_checkpoint_id, run_id, session_id, owner_id)',
        ),
      },
      {
        conname: 'fk_assistant_session_active_head',
        definition: expect.stringContaining(
          'FOREIGN KEY (session_id, active_head_sequence, owner_id)',
        ),
      },
      {
        conname: 'uq_assistant_outbox_topic_aggregate_sequence',
        definition: 'UNIQUE (topic, aggregate_type, aggregate_id, aggregate_sequence)',
      },
    ]);

    const eventRowId = eventRows.find(row => row.sequence === '2')!.event_row_id;
    const insertOutbox = () =>
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_outbox"
         (owner_id, session_id, event_row_id, topic, aggregate_type, aggregate_id,
          aggregate_sequence, payload, payload_sha256)
         VALUES ('owner-backfill', 'session-backfill', $1, 'backfill.event', 'session',
          'session-backfill', 2, '{}'::jsonb, $2)`,
        [eventRowId, Buffer.alloc(32, 45)],
      );
    await insertOutbox();
    await expect(insertOutbox()).rejects.toThrow();

    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    const removedColumns = (await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1
         AND ((table_name = 'assistant_session' AND column_name IN ('next_event_sequence', 'active_head_sequence'))
           OR (table_name = 'assistant_run' AND column_name = 'current_checkpoint_id'))`,
      [schema],
    )) as unknown[];
    expect(removedColumns).toEqual([]);
    const removedConstraints = (await dataSource.query(
      `SELECT conname FROM pg_constraint
       WHERE connamespace = $1::regnamespace
         AND conname IN (
           'fk_assistant_session_active_head',
           'fk_assistant_run_current_checkpoint_lineage',
           'uq_assistant_outbox_topic_aggregate_sequence',
           'uq_assistant_event_session_sequence_owner'
         )`,
      [schema],
    )) as unknown[];
    expect(removedConstraints).toEqual([]);
    await dataSource.query(
      `DELETE FROM "${schema}"."assistant_outbox" WHERE session_id = 'session-backfill'`,
    );
    await dataSource.query(
      `DELETE FROM "${schema}"."assistant_event" WHERE session_id = 'session-backfill'`,
    );
    await dataSource.query(
      `DELETE FROM "${schema}"."assistant_session" WHERE session_id = 'session-backfill'`,
    );
    expect(await dataSource.runMigrations()).toHaveLength(2);
  });

  it('rejects a 4.5 upgrade when existing Session history contains a gap', async () => {
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_session" (session_id, owner_id, title)
       VALUES ('session-gap', 'owner-gap', 'Gap fixture')`,
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_event"
       (owner_id, event_id, session_id, sequence, event_type, payload, payload_sha256, occurred_at)
       VALUES ('owner-gap', 'event-gap', 'session-gap', 2, 'message',
        '{"type":"message"}'::jsonb, $1, CURRENT_TIMESTAMP)`,
      [Buffer.alloc(32, 42)],
    );

    await expect(dataSource.runMigrations()).rejects.toThrow(
      'existing event history is not contiguous from sequence 1',
    );
    const columns = (await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'assistant_session'
         AND column_name IN ('next_event_sequence', 'active_head_sequence')`,
      [schema],
    )) as unknown[];
    expect(columns).toEqual([]);

    await dataSource.query(
      `DELETE FROM "${schema}"."assistant_event" WHERE event_id = 'event-gap'`,
    );
    await dataSource.query(
      `DELETE FROM "${schema}"."assistant_session" WHERE session_id = 'session-gap'`,
    );
    expect(await dataSource.runMigrations()).toHaveLength(2);
  });

  it('is idempotent, reverses 4.8, 4.5, 4.3 and 4.2 independently, then can fully re-apply', async () => {
    expect(await dataSource.runMigrations()).toEqual([]);
    await dataSource.undoLastMigration();
    expect(await tableNames()).toEqual(expectedTables);
    await dataSource.undoLastMigration();
    expect(await tableNames()).toEqual(expectedTables);
    await dataSource.undoLastMigration();
    expect(await tableNames()).toEqual(expectedTables);
    await dataSource.undoLastMigration();
    expect(await tableNames()).toEqual(expectedCoreTables);
    const schemaRows = (await dataSource.query(
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
      [schema],
    )) as unknown[];
    expect(schemaRows).toHaveLength(1);
    expect(await dataSource.runMigrations()).toHaveLength(4);
    expect(await tableNames()).toEqual(expectedTables);

    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    expect(await tableNames()).toEqual([]);
    expect(await dataSource.runMigrations()).toHaveLength(5);
    expect(await tableNames()).toEqual(expectedTables);
  });
});
