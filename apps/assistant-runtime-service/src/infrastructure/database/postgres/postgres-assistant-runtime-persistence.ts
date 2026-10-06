import type { DataSource, EntityManager } from 'typeorm';
import { validatePostgresSchemaName } from '../../../config/environment';
import type {
  AssistantRuntimeRepositoryPort,
  OwnedRow,
  OwnerId,
  OwnerScopedMutationResult,
  OwnerScopedRuntimeRepositories,
  ResourceId,
} from '../../../modules/assistant/application/ports/assistant-runtime-repository.port';
import type { AssistantRuntimeTransactionPort } from '../../../modules/assistant/application/ports/assistant-runtime-transaction.port';
import type {
  AssistantRuntimeAtomicCommitPort,
  AtomicSessionCommitInput,
  AtomicSessionCommitResult,
} from '../../../modules/assistant/application/ports/assistant-runtime-atomic-commit.port';
import type {
  AssistantCommandRecord,
  AssistantCommandState,
  AssistantCommandType,
  AssistantRuntimeCommandPort,
  RecordAssistantCommandInput,
  RecordAssistantCommandResult,
} from '../../../modules/assistant/application/ports/assistant-runtime-command.port';
import type {
  AssistantRuntimeOutboxPort,
  ClaimOutboxInput,
  FinishOutboxInput,
  OutboxDiagnostics,
  OutboxMutationResult,
  OutboxState,
  OutboxWorkItem,
  PoisonOutboxInput,
  RetryOutboxInput,
} from '../../../modules/assistant/application/ports/assistant-runtime-outbox.port';

type ResourceDescriptor = Readonly<{
  table: string;
  idColumn: string;
}>;

const resource = (table: string, idColumn: string): ResourceDescriptor => ({
  table,
  idColumn,
});

const resources = {
  session: resource('assistant_session', 'session_id'),
  settings: resource('assistant_settings', 'settings_id'),
  command: resource('assistant_command', 'command_row_id'),
  run: resource('assistant_run', 'run_id'),
  turn: resource('assistant_turn', 'turn_id'),
  modelAttempt: resource('assistant_model_attempt', 'attempt_id'),
  steerCommand: resource('assistant_steer_command', 'steer_id'),
  event: resource('assistant_event', 'event_row_id'),
  checkpoint: resource('assistant_checkpoint', 'checkpoint_id'),
  contextSnapshot: resource('assistant_context_snapshot', 'snapshot_id'),
  toolExecution: resource('assistant_tool_execution', 'execution_row_id'),
  interrupt: resource('assistant_interrupt', 'interrupt_id'),
  mcpConnection: resource('assistant_mcp_connection', 'connection_id'),
  clientBinding: resource('assistant_client_binding', 'binding_id'),
  artifact: resource('assistant_artifact', 'artifact_id'),
  artifactReference: resource('assistant_artifact_reference', 'reference_id'),
  memoryOperation: resource('assistant_memory_operation', 'operation_id'),
  memoryOperationSource: resource('assistant_memory_operation_source', 'source_row_id'),
  deletionReceipt: resource('assistant_deletion_receipt', 'deletion_id'),
  auditRecord: resource('assistant_audit_record', 'audit_id'),
} as const;

const requireOwnerId = (ownerId: OwnerId): string => {
  const normalized = ownerId.trim();
  if (normalized.length === 0) {
    throw new Error('ownerId must be non-empty');
  }
  return normalized;
};

const returningRows = <Row>(result: Row[] | [Row[], number]): Row[] =>
  Array.isArray(result[0]) ? (result[0] as Row[]) : (result as Row[]);

type AssistantCommandDatabaseRow = Readonly<{
  command_row_id: string;
  command_id: string;
  session_id: string | null;
  command_type: AssistantCommandType;
  state: AssistantCommandState;
  result_resource_type: string | null;
  result_resource_id: string | null;
  result_resource_version: string | null;
  error_code: string | null;
  request_hash_matches: boolean;
}>;

const toCommandRecord = (row: AssistantCommandDatabaseRow): AssistantCommandRecord => ({
  commandRowId: row.command_row_id,
  commandId: row.command_id,
  sessionId: row.session_id,
  commandType: row.command_type,
  state: row.state,
  resultResourceType: row.result_resource_type,
  resultResourceId: row.result_resource_id,
  resultResourceVersion:
    row.result_resource_version === null ? null : Number(row.result_resource_version),
  errorCode: row.error_code,
});

const requireNonBlank = (value: string, name: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} must be non-empty`);
  return normalized;
};

const requireRequestHash = (value: Uint8Array): Buffer => {
  if (value.byteLength !== 32) {
    throw new Error('requestHash must contain exactly 32 bytes');
  }
  return Buffer.from(value);
};

type OutboxDatabaseRow = Readonly<{
  outbox_row_id: string;
  owner_id: string;
  session_id: string;
  run_id: string | null;
  event_row_id: string | null;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_sequence: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  claimed_by: string;
  claimed_at: Date;
}>;

const toOutboxWorkItem = (row: OutboxDatabaseRow): OutboxWorkItem => ({
  outboxRowId: row.outbox_row_id,
  // 重领不会改变 deliveryKey，发布端和消费者可据此去重。
  deliveryKey: `assistant-outbox:${row.outbox_row_id}`,
  ownerId: row.owner_id,
  sessionId: row.session_id,
  runId: row.run_id,
  eventRowId: row.event_row_id,
  topic: row.topic,
  aggregateType: row.aggregate_type,
  aggregateId: row.aggregate_id,
  aggregateSequence: Number(row.aggregate_sequence),
  payload: row.payload,
  attemptCount: row.attempt_count,
  claimedBy: row.claimed_by,
  claimedAt: row.claimed_at,
});

class PostgresOwnerScopedRuntimeRepositories implements OwnerScopedRuntimeRepositories {
  readonly sessions = {
    findSession: (sessionId: string) => this.find(resources.session, sessionId),
    findSettings: (settingsId: string) => this.find(resources.settings, settingsId),
    updateSessionTitle: (sessionId: string, title: string) =>
      this.updateText(resources.session, sessionId, 'title', title, true),
  };

  readonly executions = {
    findCommand: (commandRowId: ResourceId) => this.find(resources.command, commandRowId),
    findRun: (runId: string) => this.find(resources.run, runId),
    findTurn: (turnId: string) => this.find(resources.turn, turnId),
    findModelAttempt: (attemptId: string) => this.find(resources.modelAttempt, attemptId),
    findSteerCommand: (steerId: string) => this.find(resources.steerCommand, steerId),
  };

  readonly history = {
    findEvent: (eventRowId: ResourceId) => this.find(resources.event, eventRowId),
  };

  readonly tools = {
    findCheckpoint: (checkpointId: string) =>
      this.find(resources.checkpoint, checkpointId),
    findContextSnapshot: (snapshotId: string) =>
      this.find(resources.contextSnapshot, snapshotId),
    findToolExecution: (executionRowId: ResourceId) =>
      this.find(resources.toolExecution, executionRowId),
    findInterrupt: (interruptId: string) => this.find(resources.interrupt, interruptId),
  };

  readonly connections = {
    findMcpConnection: (connectionId: string) =>
      this.find(resources.mcpConnection, connectionId),
    findClientBinding: (bindingId: string) =>
      this.find(resources.clientBinding, bindingId),
    updateMcpConnectionDisplayName: (connectionId: string, displayName: string) =>
      this.updateText(
        resources.mcpConnection,
        connectionId,
        'display_name',
        displayName,
        true,
      ),
  };

  readonly artifacts = {
    findArtifact: (artifactId: string) => this.find(resources.artifact, artifactId),
    findArtifactReference: (referenceId: string) =>
      this.find(resources.artifactReference, referenceId),
  };

  readonly memory = {
    findMemoryOperation: (operationId: string) =>
      this.find(resources.memoryOperation, operationId),
    findMemoryOperationSource: (sourceRowId: ResourceId) =>
      this.find(resources.memoryOperationSource, sourceRowId),
  };

  readonly governance = {
    findDeletionReceipt: (deletionId: string) =>
      this.find(resources.deletionReceipt, deletionId),
    findAuditRecord: (auditId: string) => this.find(resources.auditRecord, auditId),
  };

  constructor(
    private readonly manager: EntityManager,
    private readonly schema: string,
    private readonly ownerId: string,
  ) {}

  /** ID 与 owner 必须在同一条 SQL 中匹配，避免先鉴权后裸 ID 更新的竞态窗口。 */
  private async find(
    descriptor: ResourceDescriptor,
    id: ResourceId,
  ): Promise<OwnedRow | null> {
    const rows = (await this.manager.query(
      `SELECT * FROM "${this.schema}"."${descriptor.table}"
       WHERE "${descriptor.idColumn}" = $1 AND "owner_id" = $2
       LIMIT 1`,
      [id, this.ownerId],
    )) as OwnedRow[];
    return rows[0] ?? null;
  }

  private async updateText(
    descriptor: ResourceDescriptor,
    id: ResourceId,
    column: 'title' | 'display_name',
    value: string,
    updateTimestamp: boolean,
  ): Promise<OwnerScopedMutationResult> {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new Error(`${column} must be non-empty`);
    }
    const timestampSql = updateTimestamp ? ', "updated_at" = CURRENT_TIMESTAMP' : '';
    const result = (await this.manager.query(
      `UPDATE "${this.schema}"."${descriptor.table}"
       SET "${column}" = $1${timestampSql}
       WHERE "${descriptor.idColumn}" = $2 AND "owner_id" = $3
       RETURNING "${descriptor.idColumn}"`,
      [normalized, id, this.ownerId],
    )) as OwnedRow[] | [OwnedRow[], number];
    // TypeORM PostgreSQL 的 UPDATE raw result 是 [RETURNING rows, affected]；
    // SELECT 则直接返回 rows。这里显式归一化，不能把 tuple 长度误当成命中行数。
    const returnedRows = returningRows(result);

    // 零行统一表示“不存在或无权访问”，禁止再用裸 ID 查询区分两种情况。
    return returnedRows.length === 0
      ? { outcome: 'not_found_or_not_authorized' }
      : { outcome: 'updated' };
  }
}

/** PostgreSQL 实现只把 owner-scoped bundle 暴露给上层，不泄漏 TypeORM 原语。 */
class PostgresAssistantRuntimePersistence
  implements
    AssistantRuntimeRepositoryPort,
    AssistantRuntimeTransactionPort,
    AssistantRuntimeAtomicCommitPort,
    AssistantRuntimeCommandPort,
    AssistantRuntimeOutboxPort
{
  private readonly schema: string;

  constructor(
    private readonly dataSource: DataSource,
    schema: string,
  ) {
    this.schema = validatePostgresSchemaName(schema);
  }

  forOwner(ownerId: OwnerId): OwnerScopedRuntimeRepositories {
    return this.createRepositories(this.dataSource.manager, ownerId);
  }

  async withOwnerTransaction<T>(
    ownerId: OwnerId,
    work: (repositories: OwnerScopedRuntimeRepositories) => Promise<T>,
  ): Promise<T> {
    const normalizedOwnerId = requireOwnerId(ownerId);
    return this.dataSource.manager.transaction(manager =>
      work(this.createRepositories(manager, normalizedOwnerId)),
    );
  }

  async recordCommand(
    input: RecordAssistantCommandInput,
  ): Promise<RecordAssistantCommandResult> {
    const ownerId = requireOwnerId(input.ownerId);
    const commandId = requireNonBlank(input.commandId, 'commandId');
    const correlationId = requireNonBlank(input.correlationId, 'correlationId');
    const sessionId =
      input.sessionId === undefined
        ? null
        : requireNonBlank(input.sessionId, 'sessionId');
    const requestHash = requireRequestHash(input.requestHash);
    if (
      input.expectedResourceVersion !== undefined &&
      (!Number.isSafeInteger(input.expectedResourceVersion) ||
        input.expectedResourceVersion < 0)
    ) {
      throw new Error('expectedResourceVersion must be a non-negative safe integer');
    }

    // 唯一约束负责并发串行化：只有一个请求能插入，其余请求读取同一耐久结果。
    const inserted = (await this.dataSource.manager.query(
      `INSERT INTO "${this.schema}"."assistant_command"
       (owner_id, command_id, session_id, command_type, request_schema_version,
        request_hash, expected_resource_version, correlation_id)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
       ON CONFLICT ("owner_id", "command_id") DO NOTHING
       RETURNING command_row_id, command_id, session_id, command_type, state,
         result_resource_type, result_resource_id, result_resource_version, error_code,
         true AS request_hash_matches`,
      [
        ownerId,
        commandId,
        sessionId,
        input.commandType,
        requestHash,
        input.expectedResourceVersion ?? null,
        correlationId,
      ],
    )) as AssistantCommandDatabaseRow[];
    if (inserted[0] !== undefined) {
      return { outcome: 'accepted', command: toCommandRecord(inserted[0]) };
    }

    const existing = (await this.dataSource.manager.query(
      `SELECT command_row_id, command_id, session_id, command_type, state,
              result_resource_type, result_resource_id, result_resource_version,
              error_code, request_hash = $3 AS request_hash_matches
       FROM "${this.schema}"."assistant_command"
       WHERE owner_id = $1 AND command_id = $2
       LIMIT 1`,
      [ownerId, commandId, requestHash],
    )) as AssistantCommandDatabaseRow[];
    const recorded = existing[0];
    if (recorded === undefined) {
      // 命令记录不提供删除路径；若未来加入清理策略，必须先定义与重试的兼容语义。
      throw new Error('Command record disappeared during idempotency resolution');
    }
    if (!recorded.request_hash_matches) return { outcome: 'request_conflict' };
    return { outcome: 'replayed', command: toCommandRecord(recorded) };
  }

  async claimOutbox(input: ClaimOutboxInput): Promise<readonly OutboxWorkItem[]> {
    const workerId = requireNonBlank(input.workerId, 'workerId');
    if (!Number.isSafeInteger(input.limit) || input.limit <= 0 || input.limit > 1_000) {
      throw new Error('limit must be a positive safe integer no greater than 1000');
    }
    if (!Number.isSafeInteger(input.claimTimeoutMs) || input.claimTimeoutMs <= 0) {
      throw new Error('claimTimeoutMs must be a positive safe integer');
    }

    const result = (await this.dataSource.manager.query(
      `WITH claimable AS (
         SELECT outbox_row_id
         FROM "${this.schema}"."assistant_outbox"
         WHERE (
           state IN ('Pending', 'RetryableFailure') AND available_at <= $1
         ) OR (
           state = 'Claimed' AND claimed_at <= $1 - ($2 * interval '1 millisecond')
         )
         ORDER BY available_at ASC, outbox_row_id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $3
       )
       UPDATE "${this.schema}"."assistant_outbox" AS work
       SET state = 'Claimed', attempt_count = work.attempt_count + 1,
           claimed_by = $4, claimed_at = $1, published_at = NULL,
           last_error_code = NULL
       FROM claimable
       WHERE work.outbox_row_id = claimable.outbox_row_id
       RETURNING work.outbox_row_id, work.owner_id, work.session_id, work.run_id,
         work.event_row_id, work.topic, work.aggregate_type, work.aggregate_id,
         work.aggregate_sequence, work.payload, work.attempt_count,
         work.claimed_by, work.claimed_at`,
      [input.now, input.claimTimeoutMs, input.limit, workerId],
    )) as OutboxDatabaseRow[] | [OutboxDatabaseRow[], number];
    return returningRows(result).map(toOutboxWorkItem);
  }

  async completeOutbox(input: FinishOutboxInput): Promise<OutboxMutationResult> {
    return this.finishClaimedOutbox(
      input.outboxRowId,
      input.workerId,
      `state = 'Completed', published_at = $3, last_error_code = NULL`,
      [input.now],
    );
  }

  async retryOutbox(input: RetryOutboxInput): Promise<OutboxMutationResult> {
    const errorCode = requireNonBlank(input.errorCode, 'errorCode');
    if (input.availableAt < input.now) {
      throw new Error('availableAt must not be earlier than now');
    }
    return this.finishClaimedOutbox(
      input.outboxRowId,
      input.workerId,
      `state = 'RetryableFailure', available_at = $3, last_error_code = $4`,
      [input.availableAt, errorCode],
    );
  }

  async poisonOutbox(input: PoisonOutboxInput): Promise<OutboxMutationResult> {
    const errorCode = requireNonBlank(input.errorCode, 'errorCode');
    return this.finishClaimedOutbox(
      input.outboxRowId,
      input.workerId,
      `state = 'Poisoned', last_error_code = $3`,
      [errorCode],
    );
  }

  async getOutboxDiagnostics(now: Date): Promise<OutboxDiagnostics> {
    const rows = (await this.dataSource.manager.query(
      `SELECT state, count(*)::integer AS count
       FROM "${this.schema}"."assistant_outbox"
       GROUP BY state`,
    )) as Array<{ state: OutboxState; count: number }>;
    const counts: Record<OutboxState, number> = {
      Pending: 0,
      Claimed: 0,
      Completed: 0,
      RetryableFailure: 0,
      Poisoned: 0,
    };
    for (const row of rows) counts[row.state] = row.count;
    const [ready] = (await this.dataSource.manager.query(
      `SELECT count(*)::integer AS ready_count, min(available_at) AS oldest_ready_at
       FROM "${this.schema}"."assistant_outbox"
       WHERE state IN ('Pending', 'RetryableFailure') AND available_at <= $1`,
      [now],
    )) as Array<{ ready_count: number; oldest_ready_at: Date | null }>;
    return {
      counts,
      readyCount: ready?.ready_count ?? 0,
      oldestReadyAt: ready?.oldest_ready_at ?? null,
    };
  }

  private async finishClaimedOutbox(
    outboxRowId: string,
    workerId: string,
    assignment: string,
    assignmentParameters: readonly unknown[],
  ): Promise<OutboxMutationResult> {
    const normalizedRowId = requireNonBlank(outboxRowId, 'outboxRowId');
    const normalizedWorkerId = requireNonBlank(workerId, 'workerId');
    const result = (await this.dataSource.manager.query(
      `UPDATE "${this.schema}"."assistant_outbox"
       SET ${assignment}
       WHERE outbox_row_id = $1 AND state = 'Claimed' AND claimed_by = $2
       RETURNING outbox_row_id`,
      [normalizedRowId, normalizedWorkerId, ...assignmentParameters],
    )) as OwnedRow[] | [OwnedRow[], number];
    return returningRows(result).length === 0
      ? { outcome: 'not_claim_owner_or_terminal' }
      : { outcome: 'updated' };
  }

  async commit(input: AtomicSessionCommitInput): Promise<AtomicSessionCommitResult> {
    const ownerId = requireOwnerId(input.ownerId);
    return this.dataSource.manager.transaction(async manager => {
      const sessionRows = (await manager.query(
        `SELECT "resource_version", "next_event_sequence"
         FROM "${this.schema}"."assistant_session"
         WHERE "session_id" = $1 AND "owner_id" = $2
         FOR UPDATE`,
        [input.sessionId, ownerId],
      )) as Array<{ resource_version: string; next_event_sequence: string }>;
      const session = sessionRows[0];
      if (session === undefined) {
        return { outcome: 'not_found_or_transition_conflict' };
      }

      const sequence = Number(session.next_event_sequence);
      if (!Number.isSafeInteger(sequence) || sequence < 1) {
        throw new Error('Session next_event_sequence exceeds the supported range');
      }

      let runVersion: number | null = null;
      const transition = input.runTransition;
      if (transition !== undefined) {
        if (input.event.runId !== transition.runId) {
          return { outcome: 'not_found_or_transition_conflict' };
        }
        const nextRunVersion = transition.expectedVersion + 1;
        if (transition.checkpointId !== undefined) {
          const checkpointRows = (await manager.query(
            `/* assistant_atomic_checkpoint_ready */
             SELECT "checkpoint_id"
             FROM "${this.schema}"."assistant_checkpoint"
             WHERE "checkpoint_id" = $1
               AND "owner_id" = $2
               AND "session_id" = $3
               AND "run_id" = $4
               AND "state" = 'Ready'
               AND "run_resource_version" = $5
               AND "last_event_sequence" = $6
             FOR SHARE`,
            [
              transition.checkpointId,
              ownerId,
              input.sessionId,
              transition.runId,
              nextRunVersion,
              sequence,
            ],
          )) as OwnedRow[];
          if (checkpointRows.length === 0) {
            return { outcome: 'not_found_or_transition_conflict' };
          }
        }

        const runResult = (await manager.query(
          `UPDATE "${this.schema}"."assistant_run"
           SET "state" = $1,
               "resource_version" = "resource_version" + 1,
               "current_checkpoint_id" = coalesce($2, "current_checkpoint_id"),
               "started_at" = coalesce($3, "started_at"),
               "finished_at" = $4,
               "terminal_reason_code" = $5,
               "updated_at" = CURRENT_TIMESTAMP
           WHERE "run_id" = $6
             AND "session_id" = $7
             AND "owner_id" = $8
             AND "resource_version" = $9
           RETURNING "resource_version"`,
          [
            transition.newState,
            transition.checkpointId ?? null,
            transition.startedAt ?? null,
            transition.finishedAt ?? null,
            transition.terminalReasonCode ?? null,
            transition.runId,
            input.sessionId,
            ownerId,
            transition.expectedVersion,
          ],
        )) as [Array<{ resource_version: string }>, number];
        const updatedRun = returningRows<{ resource_version: string }>(runResult)[0];
        if (updatedRun === undefined) {
          return { outcome: 'not_found_or_transition_conflict' };
        }
        runVersion = Number(updatedRun.resource_version);
      } else if (input.event.runId !== undefined) {
        const runRows = (await manager.query(
          `SELECT "run_id" FROM "${this.schema}"."assistant_run"
           WHERE "run_id" = $1 AND "session_id" = $2 AND "owner_id" = $3`,
          [input.event.runId, input.sessionId, ownerId],
        )) as OwnedRow[];
        if (runRows.length === 0) {
          return { outcome: 'not_found_or_transition_conflict' };
        }
      }

      const eventResult = (await manager.query(
        `INSERT INTO "${this.schema}"."assistant_event"
         (owner_id, event_id, session_id, run_id, sequence, event_type, payload,
          payload_sha256, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         RETURNING "event_row_id"`,
        [
          ownerId,
          input.event.eventId,
          input.sessionId,
          input.event.runId ?? null,
          sequence,
          input.event.type,
          JSON.stringify(input.event.payload),
          Buffer.from(input.event.payloadSha256),
          input.event.occurredAt,
        ],
      )) as [Array<{ event_row_id: string }>, number];
      const eventRowId = returningRows<{ event_row_id: string }>(eventResult)[0]!
        .event_row_id;

      const sessionResult = (await manager.query(
        `UPDATE "${this.schema}"."assistant_session"
         SET "next_event_sequence" = $1,
             "active_head_sequence" = $2,
             "resource_version" = "resource_version" + 1,
             "updated_at" = CURRENT_TIMESTAMP
         WHERE "session_id" = $3 AND "owner_id" = $4 AND "resource_version" = $5
         RETURNING "resource_version"`,
        [sequence + 1, sequence, input.sessionId, ownerId, session.resource_version],
      )) as [Array<{ resource_version: string }>, number];
      const sessionVersion = Number(
        returningRows<{ resource_version: string }>(sessionResult)[0]!.resource_version,
      );

      const outboxResult = (await manager.query(
        `INSERT INTO "${this.schema}"."assistant_outbox"
         (owner_id, session_id, run_id, event_row_id, topic, aggregate_type,
          aggregate_id, aggregate_sequence, payload, payload_sha256)
         VALUES ($1, $2, $3, $4, $5, 'session', $2, $6, $7::jsonb, $8)
         RETURNING "outbox_row_id"`,
        [
          ownerId,
          input.sessionId,
          input.event.runId ?? null,
          eventRowId,
          input.outbox.topic,
          sequence,
          JSON.stringify(input.outbox.payload),
          Buffer.from(input.outbox.payloadSha256),
        ],
      )) as [Array<{ outbox_row_id: string }>, number];

      return {
        outcome: 'committed',
        sequence,
        eventRowId,
        outboxRowId: returningRows<{ outbox_row_id: string }>(outboxResult)[0]!
          .outbox_row_id,
        sessionVersion,
        runVersion,
      };
    });
  }

  private createRepositories(
    manager: EntityManager,
    ownerId: OwnerId,
  ): OwnerScopedRuntimeRepositories {
    return new PostgresOwnerScopedRuntimeRepositories(
      manager,
      this.schema,
      requireOwnerId(ownerId),
    );
  }
}

export { PostgresAssistantRuntimePersistence };
