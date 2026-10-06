import type { OwnerId } from './assistant-runtime-repository.port';

type AssistantEventType =
  | 'message'
  | 'reasoning'
  | 'plan'
  | 'tool'
  | 'interrupt'
  | 'compaction'
  | 'run_state'
  | 'usage'
  | 'artifact'
  | 'terminal';

type AssistantRunState =
  | 'Queued'
  | 'Running'
  | 'WaitingForLocalTool'
  | 'WaitingForMcpTool'
  | 'WaitingForHuman'
  | 'Compacting'
  | 'Cancelling'
  | 'Succeeded'
  | 'Failed'
  | 'Cancelled'
  | 'ResultUnknown';

type AtomicSessionCommitInput = Readonly<{
  ownerId: OwnerId;
  sessionId: string;
  event: Readonly<{
    eventId: string;
    runId?: string;
    type: AssistantEventType;
    payload: Readonly<Record<string, unknown>>;
    payloadSha256: Uint8Array;
    occurredAt: Date;
  }>;
  runTransition?: Readonly<{
    runId: string;
    expectedVersion: number;
    newState: AssistantRunState;
    checkpointId?: string;
    startedAt?: Date;
    finishedAt?: Date;
    terminalReasonCode?: string;
  }>;
  outbox: Readonly<{
    topic: string;
    payload: Readonly<Record<string, unknown>>;
    payloadSha256: Uint8Array;
  }>;
}>;

type AtomicSessionCommitResult =
  | Readonly<{
      outcome: 'committed';
      sequence: number;
      eventRowId: string;
      outboxRowId: string;
      sessionVersion: number;
      runVersion: number | null;
    }>
  | Readonly<{
      outcome: 'not_found_or_transition_conflict';
    }>;

interface AssistantRuntimeAtomicCommitPort {
  commit(input: AtomicSessionCommitInput): Promise<AtomicSessionCommitResult>;
}

const ASSISTANT_RUNTIME_ATOMIC_COMMIT = Symbol('ASSISTANT_RUNTIME_ATOMIC_COMMIT');

export {
  ASSISTANT_RUNTIME_ATOMIC_COMMIT,
  type AssistantRuntimeAtomicCommitPort,
  type AtomicSessionCommitInput,
  type AtomicSessionCommitResult,
};
