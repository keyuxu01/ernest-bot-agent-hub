import type { OwnerId } from './assistant-runtime-repository.port';

type AssistantCommandType =
  | 'create_session'
  | 'rename'
  | 'archive'
  | 'unarchive'
  | 'delete'
  | 'start_run'
  | 'steer'
  | 'stop'
  | 'retry'
  | 'update_settings'
  | 'compact'
  | 'fork'
  | 'revert'
  | 'revert_and_edit';

type AssistantCommandState = 'Accepted' | 'Completed' | 'Failed' | 'ResultUnknown';

type RecordAssistantCommandInput = Readonly<{
  ownerId: OwnerId;
  commandId: string;
  sessionId?: string;
  commandType: AssistantCommandType;
  requestHash: Uint8Array;
  expectedResourceVersion?: number;
  correlationId: string;
}>;

type AssistantCommandRecord = Readonly<{
  commandRowId: string;
  commandId: string;
  sessionId: string | null;
  commandType: AssistantCommandType;
  state: AssistantCommandState;
  resultResourceType: string | null;
  resultResourceId: string | null;
  resultResourceVersion: number | null;
  errorCode: string | null;
}>;

type RecordAssistantCommandResult =
  | Readonly<{ outcome: 'accepted'; command: AssistantCommandRecord }>
  | Readonly<{ outcome: 'replayed'; command: AssistantCommandRecord }>
  | Readonly<{ outcome: 'request_conflict' }>;

/**
 * 在任何业务副作用前持久化命令身份。
 * 相同请求重试返回已记录状态，不同请求复用 commandId 时返回冲突。
 */
interface AssistantRuntimeCommandPort {
  recordCommand(
    input: RecordAssistantCommandInput,
  ): Promise<RecordAssistantCommandResult>;
}

const ASSISTANT_RUNTIME_COMMAND = Symbol('ASSISTANT_RUNTIME_COMMAND');

export {
  ASSISTANT_RUNTIME_COMMAND,
  type AssistantCommandRecord,
  type AssistantCommandState,
  type AssistantCommandType,
  type AssistantRuntimeCommandPort,
  type RecordAssistantCommandInput,
  type RecordAssistantCommandResult,
};
