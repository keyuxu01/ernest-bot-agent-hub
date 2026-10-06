import { z } from 'zod';
import {
  AssistantRuntimeEventIdSchema,
  AssistantRuntimeRunIdSchema,
  AssistantRuntimeSchemaVersionSchema,
  AssistantRuntimeSequenceSchema,
  AssistantRuntimeSessionIdSchema,
  AssistantRuntimeTimestampSchema,
} from './protocol';
import { AssistantRuntimeRunStateSchema } from './session-runtime';
import { AssistantRuntimeArtifactEventPayloadSchema } from './artifact-observability';

const payloads = [
  z.object({ type: z.literal('message'), role: z.enum(['user', 'assistant']), text: z.string() }),
  z.object({ type: z.literal('reasoning'), text: z.string(), redacted: z.boolean() }),
  z.object({ type: z.literal('plan'), text: z.string() }),
  z.object({ type: z.literal('tool'), toolExecutionId: z.string().min(1), phase: z.enum(['requested', 'completed', 'failed', 'result_unknown']) }),
  z.object({ type: z.literal('interrupt'), interruptId: z.string().min(1), phase: z.enum(['requested', 'answered', 'rejected', 'cancelled']) }),
  z.object({ type: z.literal('compaction'), compactId: z.string().min(1), coveredThroughSequence: AssistantRuntimeSequenceSchema }),
  z.object({ type: z.literal('run_state'), state: AssistantRuntimeRunStateSchema }),
  z.discriminatedUnion('source', [
    z.object({ type: z.literal('usage'), source: z.enum(['provider_reported', 'estimated']), inputTokens: z.int().nonnegative(), outputTokens: z.int().nonnegative(), reasoningTokens: z.int().nonnegative().optional(), cachedTokens: z.int().nonnegative().optional(), cost: z.number().nonnegative().nullable() }),
    z.object({ type: z.literal('usage'), source: z.literal('unavailable') }),
  ]),
  AssistantRuntimeArtifactEventPayloadSchema,
  z.object({ type: z.literal('terminal'), state: z.enum(['Succeeded', 'Failed', 'Cancelled', 'ResultUnknown']), code: z.string().min(1).optional() }),
] as const;

const AssistantRuntimeEventPayloadSchema = z.union(payloads);

const AssistantRuntimeDurableEventObjectSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  eventId: AssistantRuntimeEventIdSchema,
  sessionId: AssistantRuntimeSessionIdSchema,
  runId: AssistantRuntimeRunIdSchema.nullable(),
  sequence: AssistantRuntimeSequenceSchema,
  occurredAt: AssistantRuntimeTimestampSchema,
  type: z.enum(['message', 'reasoning', 'plan', 'tool', 'interrupt', 'compaction', 'run_state', 'usage', 'artifact', 'terminal']),
  payloadVersion: z.literal(1),
  payload: AssistantRuntimeEventPayloadSchema,
});

const requireMatchingEventType = (
  value: z.output<typeof AssistantRuntimeDurableEventObjectSchema>,
  context: z.core.$RefinementCtx,
): void => {
  if (value.type !== value.payload.type) {
    context.addIssue({
      code: 'custom',
      path: ['payload', 'type'],
      message: 'Event type must match payload type',
      input: value,
    });
  }
};

const AssistantRuntimeDurableEventSchema =
  AssistantRuntimeDurableEventObjectSchema.superRefine(requireMatchingEventType);

const AssistantRuntimeSseFrameSchema = z.union([
  AssistantRuntimeDurableEventObjectSchema.extend({ frameType: z.literal('event') }).superRefine(requireMatchingEventType),
  z.object({
    schemaVersion: AssistantRuntimeSchemaVersionSchema,
    frameType: z.literal('heartbeat'),
    emittedAt: AssistantRuntimeTimestampSchema,
  }),
  z.object({
    schemaVersion: AssistantRuntimeSchemaVersionSchema,
    frameType: z.literal('resumable_close'),
    sessionId: AssistantRuntimeSessionIdSchema,
    afterSequence: AssistantRuntimeSequenceSchema,
    reason: z.enum(['slow_consumer', 'token_expired', 'server_shutdown']),
  }),
]);

type AssistantRuntimeEventPayload = z.output<typeof AssistantRuntimeEventPayloadSchema>;
type AssistantRuntimeDurableEvent = z.output<typeof AssistantRuntimeDurableEventSchema>;
type AssistantRuntimeSseFrame = z.output<typeof AssistantRuntimeSseFrameSchema>;

export type { AssistantRuntimeDurableEvent, AssistantRuntimeEventPayload, AssistantRuntimeSseFrame };
export { AssistantRuntimeDurableEventSchema, AssistantRuntimeEventPayloadSchema, AssistantRuntimeSseFrameSchema };
