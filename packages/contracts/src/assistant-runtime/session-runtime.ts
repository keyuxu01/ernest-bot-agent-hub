import { z } from 'zod';
import {
  AssistantRuntimeCommandMetadataSchema,
  AssistantRuntimeCommandIdSchema,
  AssistantRuntimeResourceVersionSchema,
  AssistantRuntimeRunIdSchema,
  AssistantRuntimeSchemaVersionSchema,
  AssistantRuntimeSequenceSchema,
  AssistantRuntimeSessionIdSchema,
  AssistantRuntimeTimestampSchema,
} from './protocol';

const AssistantRuntimeRunStateSchema = z.enum([
  'Queued',
  'Running',
  'WaitingForLocalTool',
  'WaitingForMcpTool',
  'WaitingForHuman',
  'Compacting',
  'Cancelling',
  'Succeeded',
  'Failed',
  'Cancelled',
  'ResultUnknown',
]);

const AssistantRuntimeTerminalRunStateSchema = z.enum([
  'Succeeded',
  'Failed',
  'Cancelled',
  'ResultUnknown',
]);

const AssistantRuntimeSessionSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  sessionId: AssistantRuntimeSessionIdSchema,
  resourceVersion: AssistantRuntimeResourceVersionSchema,
  title: z.string().min(1).max(256),
  archived: z.boolean(),
  activeHeadSequence: AssistantRuntimeSequenceSchema.nullable(),
  activeRunId: AssistantRuntimeRunIdSchema.nullable(),
  createdAt: AssistantRuntimeTimestampSchema,
  updatedAt: AssistantRuntimeTimestampSchema,
});

const AssistantRuntimeRunSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  runId: AssistantRuntimeRunIdSchema,
  sessionId: AssistantRuntimeSessionIdSchema,
  resourceVersion: AssistantRuntimeResourceVersionSchema,
  state: AssistantRuntimeRunStateSchema,
  fencingToken: z.int().nonnegative(),
  startedAt: AssistantRuntimeTimestampSchema.nullable(),
  finishedAt: AssistantRuntimeTimestampSchema.nullable(),
});

const AssistantRuntimeTurnSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  turnId: z.string().min(1).max(128),
  runId: AssistantRuntimeRunIdSchema,
  ordinal: z.int().nonnegative(),
  inputEventSequence: AssistantRuntimeSequenceSchema,
});

const AssistantRuntimeModelAttemptSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  attemptId: z.string().min(1).max(128),
  turnId: z.string().min(1).max(128),
  ordinal: z.int().nonnegative(),
  outcome: z.enum([
    'continuation',
    'completed',
    'retryable_failure',
    'tool_failure',
    'permanent_failure',
  ]),
  providerCorrelationId: z.string().min(1).max(256).optional(),
});

const AssistantRuntimeSettingsPatchSchema = z.object({
  providerConnectionId: z.string().min(1).max(128).optional(),
  model: z.string().min(1).max(256).optional(),
  reasoningEffort: z.string().min(1).max(64).nullable().optional(),
  serviceTier: z.string().min(1).max(64).nullable().optional(),
});
type AssistantRuntimeSettingsPatch = z.output<typeof AssistantRuntimeSettingsPatchSchema>;
type AssistantRuntimeTerminalRunState = z.output<typeof AssistantRuntimeTerminalRunStateSchema>;

const AssistantRuntimeVersionedCommandMetadataSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  commandId: AssistantRuntimeCommandIdSchema,
  expectedVersion: AssistantRuntimeResourceVersionSchema,
});

const AssistantRuntimeSessionSettingsSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  sessionId: AssistantRuntimeSessionIdSchema,
  resourceVersion: AssistantRuntimeResourceVersionSchema,
  providerConnectionId: z.string().min(1).max(128),
  model: z.string().min(1).max(256),
  reasoningEffort: z.string().min(1).max(64).nullable(),
  serviceTier: z.string().min(1).max(64).nullable(),
});

const commandBase = {
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  metadata: AssistantRuntimeCommandMetadataSchema,
  sessionId: AssistantRuntimeSessionIdSchema,
};
const versionedCommandBase = {
  ...commandBase,
  metadata: AssistantRuntimeVersionedCommandMetadataSchema,
};

const AssistantRuntimeSessionCommandSchema = z.discriminatedUnion('type', [
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, metadata: AssistantRuntimeCommandMetadataSchema, type: z.literal('create_session'), title: z.string().min(1).max(256).optional() }),
  z.object({ ...versionedCommandBase, type: z.literal('rename'), title: z.string().min(1).max(256) }),
  z.object({ ...versionedCommandBase, type: z.literal('archive') }),
  z.object({ ...versionedCommandBase, type: z.literal('unarchive') }),
  z.object({ ...versionedCommandBase, type: z.literal('delete') }),
  z.object({ ...commandBase, type: z.literal('start_run'), input: z.string().min(1).max(1_048_576) }),
  z.object({ ...commandBase, type: z.literal('steer'), runId: AssistantRuntimeRunIdSchema, input: z.string().min(1).max(1_048_576) }),
  z.object({ ...commandBase, type: z.literal('stop'), runId: AssistantRuntimeRunIdSchema }),
  z.object({ ...commandBase, type: z.literal('retry'), runId: AssistantRuntimeRunIdSchema }),
  z.object({ ...versionedCommandBase, type: z.literal('update_settings'), patch: AssistantRuntimeSettingsPatchSchema }),
  z.object({ ...commandBase, type: z.literal('compact'), mode: z.enum(['automatic', 'forced']) }),
  z.object({ ...commandBase, type: z.literal('fork'), atSequence: AssistantRuntimeSequenceSchema }),
  z.object({ ...versionedCommandBase, type: z.literal('revert'), toSequence: AssistantRuntimeSequenceSchema }),
  z.object({ ...versionedCommandBase, type: z.literal('revert_and_edit'), toSequence: AssistantRuntimeSequenceSchema, editedInput: z.string().min(1).max(1_048_576) }),
]);

const AssistantRuntimeCompactPointSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  compactId: z.string().min(1).max(128),
  sessionId: AssistantRuntimeSessionIdSchema,
  coveredThroughSequence: AssistantRuntimeSequenceSchema,
  summaryEventSequence: AssistantRuntimeSequenceSchema,
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
});

const AssistantRuntimeForkResultSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  sourceSessionId: AssistantRuntimeSessionIdSchema,
  sourceSequence: AssistantRuntimeSequenceSchema,
  targetSession: AssistantRuntimeSessionSchema,
});

const AssistantRuntimeRevertResultSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  sessionId: AssistantRuntimeSessionIdSchema,
  resourceVersion: AssistantRuntimeResourceVersionSchema,
  activeHeadSequence: AssistantRuntimeSequenceSchema,
  startedRunId: AssistantRuntimeRunIdSchema.nullable(),
});

type AssistantRuntimeRunState = z.output<typeof AssistantRuntimeRunStateSchema>;
type AssistantRuntimeSession = z.output<typeof AssistantRuntimeSessionSchema>;
type AssistantRuntimeRun = z.output<typeof AssistantRuntimeRunSchema>;
type AssistantRuntimeTurn = z.output<typeof AssistantRuntimeTurnSchema>;
type AssistantRuntimeModelAttempt = z.output<typeof AssistantRuntimeModelAttemptSchema>;
type AssistantRuntimeSessionCommand = z.output<typeof AssistantRuntimeSessionCommandSchema>;
type AssistantRuntimeCompactPoint = z.output<typeof AssistantRuntimeCompactPointSchema>;
type AssistantRuntimeSessionSettings = z.output<typeof AssistantRuntimeSessionSettingsSchema>;
type AssistantRuntimeForkResult = z.output<typeof AssistantRuntimeForkResultSchema>;
type AssistantRuntimeRevertResult = z.output<typeof AssistantRuntimeRevertResultSchema>;

export type { AssistantRuntimeCompactPoint, AssistantRuntimeForkResult, AssistantRuntimeModelAttempt, AssistantRuntimeRevertResult, AssistantRuntimeRun, AssistantRuntimeRunState, AssistantRuntimeSession, AssistantRuntimeSessionCommand, AssistantRuntimeSessionSettings, AssistantRuntimeSettingsPatch, AssistantRuntimeTerminalRunState, AssistantRuntimeTurn };
export { AssistantRuntimeCompactPointSchema, AssistantRuntimeForkResultSchema, AssistantRuntimeModelAttemptSchema, AssistantRuntimeRevertResultSchema, AssistantRuntimeRunSchema, AssistantRuntimeRunStateSchema, AssistantRuntimeSessionCommandSchema, AssistantRuntimeSessionSchema, AssistantRuntimeSessionSettingsSchema, AssistantRuntimeSettingsPatchSchema, AssistantRuntimeTerminalRunStateSchema, AssistantRuntimeTurnSchema, AssistantRuntimeVersionedCommandMetadataSchema };
