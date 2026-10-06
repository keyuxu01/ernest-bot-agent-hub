type OutboxState = 'Pending' | 'Claimed' | 'Completed' | 'RetryableFailure' | 'Poisoned';

type OutboxWorkItem = Readonly<{
  outboxRowId: string;
  deliveryKey: string;
  ownerId: string;
  sessionId: string;
  runId: string | null;
  eventRowId: string | null;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  aggregateSequence: number;
  payload: Readonly<Record<string, unknown>>;
  attemptCount: number;
  claimedBy: string;
  claimedAt: Date;
}>;

type ClaimOutboxInput = Readonly<{
  workerId: string;
  limit: number;
  now: Date;
  claimTimeoutMs: number;
}>;

type FinishOutboxInput = Readonly<{
  outboxRowId: string;
  workerId: string;
  now: Date;
}>;

type RetryOutboxInput = FinishOutboxInput &
  Readonly<{
    availableAt: Date;
    errorCode: string;
  }>;

type PoisonOutboxInput = FinishOutboxInput & Readonly<{ errorCode: string }>;

type OutboxMutationResult =
  Readonly<{ outcome: 'updated' }> | Readonly<{ outcome: 'not_claim_owner_or_terminal' }>;

type OutboxDiagnostics = Readonly<{
  counts: Readonly<Record<OutboxState, number>>;
  readyCount: number;
  oldestReadyAt: Date | null;
}>;

interface AssistantRuntimeOutboxPort {
  claimOutbox(input: ClaimOutboxInput): Promise<readonly OutboxWorkItem[]>;
  completeOutbox(input: FinishOutboxInput): Promise<OutboxMutationResult>;
  retryOutbox(input: RetryOutboxInput): Promise<OutboxMutationResult>;
  poisonOutbox(input: PoisonOutboxInput): Promise<OutboxMutationResult>;
  getOutboxDiagnostics(now: Date): Promise<OutboxDiagnostics>;
}

const ASSISTANT_RUNTIME_OUTBOX = Symbol('ASSISTANT_RUNTIME_OUTBOX');

export {
  ASSISTANT_RUNTIME_OUTBOX,
  type AssistantRuntimeOutboxPort,
  type ClaimOutboxInput,
  type FinishOutboxInput,
  type OutboxDiagnostics,
  type OutboxMutationResult,
  type OutboxState,
  type OutboxWorkItem,
  type PoisonOutboxInput,
  type RetryOutboxInput,
};
