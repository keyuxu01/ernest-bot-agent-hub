type OwnerId = string;
type ResourceId = string | bigint;
type OwnedRow = Readonly<Record<string, unknown>>;

type OwnerScopedMutationResult =
  { outcome: 'updated' } | { outcome: 'not_found_or_not_authorized' };

interface OwnerScopedSessionCatalogRepository {
  findSession(sessionId: string): Promise<OwnedRow | null>;
  findSettings(settingsId: string): Promise<OwnedRow | null>;
  updateSessionTitle(
    sessionId: string,
    title: string,
  ): Promise<OwnerScopedMutationResult>;
}

interface OwnerScopedExecutionRepository {
  findCommand(commandRowId: ResourceId): Promise<OwnedRow | null>;
  findRun(runId: string): Promise<OwnedRow | null>;
  findTurn(turnId: string): Promise<OwnedRow | null>;
  findModelAttempt(attemptId: string): Promise<OwnedRow | null>;
  findSteerCommand(steerId: string): Promise<OwnedRow | null>;
}

interface OwnerScopedHistoryRepository {
  findEvent(eventRowId: ResourceId): Promise<OwnedRow | null>;
}

interface OwnerScopedToolRepository {
  findCheckpoint(checkpointId: string): Promise<OwnedRow | null>;
  findContextSnapshot(snapshotId: string): Promise<OwnedRow | null>;
  findToolExecution(executionRowId: ResourceId): Promise<OwnedRow | null>;
  findInterrupt(interruptId: string): Promise<OwnedRow | null>;
}

interface OwnerScopedConnectionRepository {
  findMcpConnection(connectionId: string): Promise<OwnedRow | null>;
  findClientBinding(bindingId: string): Promise<OwnedRow | null>;
  updateMcpConnectionDisplayName(
    connectionId: string,
    displayName: string,
  ): Promise<OwnerScopedMutationResult>;
}

interface OwnerScopedArtifactRepository {
  findArtifact(artifactId: string): Promise<OwnedRow | null>;
  findArtifactReference(referenceId: string): Promise<OwnedRow | null>;
}

interface OwnerScopedMemoryRepository {
  findMemoryOperation(operationId: string): Promise<OwnedRow | null>;
  findMemoryOperationSource(sourceRowId: ResourceId): Promise<OwnedRow | null>;
}

interface OwnerScopedGovernanceRepository {
  findDeletionReceipt(deletionId: string): Promise<OwnedRow | null>;
  findAuditRecord(auditId: string): Promise<OwnedRow | null>;
}

/**
 * 业务代码只能取得已经绑定 owner 的仓储集合。
 * 接口故意不提供裸 ID 查询、动态表名或底层 ORM 逃生口。
 */
interface OwnerScopedRuntimeRepositories {
  readonly sessions: OwnerScopedSessionCatalogRepository;
  readonly executions: OwnerScopedExecutionRepository;
  readonly history: OwnerScopedHistoryRepository;
  readonly tools: OwnerScopedToolRepository;
  readonly connections: OwnerScopedConnectionRepository;
  readonly artifacts: OwnerScopedArtifactRepository;
  readonly memory: OwnerScopedMemoryRepository;
  readonly governance: OwnerScopedGovernanceRepository;
}

interface AssistantRuntimeRepositoryPort {
  forOwner(ownerId: OwnerId): OwnerScopedRuntimeRepositories;
}

const ASSISTANT_RUNTIME_REPOSITORY = Symbol('ASSISTANT_RUNTIME_REPOSITORY');

export {
  ASSISTANT_RUNTIME_REPOSITORY,
  type AssistantRuntimeRepositoryPort,
  type OwnedRow,
  type OwnerId,
  type OwnerScopedArtifactRepository,
  type OwnerScopedConnectionRepository,
  type OwnerScopedExecutionRepository,
  type OwnerScopedGovernanceRepository,
  type OwnerScopedHistoryRepository,
  type OwnerScopedMemoryRepository,
  type OwnerScopedMutationResult,
  type OwnerScopedRuntimeRepositories,
  type OwnerScopedSessionCatalogRepository,
  type OwnerScopedToolRepository,
  type ResourceId,
};
