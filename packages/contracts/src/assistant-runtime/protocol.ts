import { z } from 'zod';

/**
 * @description First public Assistant Runtime protocol generation.
 */
const AssistantRuntimeSchemaVersionSchema = z.literal(1);

/**
 * @description Opaque public identifier. Consumers must not infer its storage format.
 */
const AssistantRuntimeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const AssistantRuntimeCorrelationIdSchema = AssistantRuntimeIdSchema;
const AssistantRuntimeCommandIdSchema = AssistantRuntimeIdSchema;
const AssistantRuntimeEventIdSchema = AssistantRuntimeIdSchema;
const AssistantRuntimeSessionIdSchema = AssistantRuntimeIdSchema;
const AssistantRuntimeRunIdSchema = AssistantRuntimeIdSchema;

const AssistantRuntimeTimestampSchema = z.iso.datetime({ offset: true });
const AssistantRuntimeResourceVersionSchema = z.int().nonnegative();
const AssistantRuntimeSequenceSchema = z.int().nonnegative();

const AssistantRuntimeRetryClassificationSchema = z.enum([
  'not_retryable',
  'retryable',
  'retry_after',
  'result_unknown',
]);

const AssistantRuntimeCommandMetadataSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  commandId: AssistantRuntimeCommandIdSchema,
  expectedVersion: AssistantRuntimeResourceVersionSchema.optional(),
});

const AssistantRuntimeResourceReferenceSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  resourceId: AssistantRuntimeIdSchema,
  resourceVersion: AssistantRuntimeResourceVersionSchema,
});

const AssistantRuntimePageDirectionSchema = z.enum(['before', 'after']);

const AssistantRuntimePageCursorSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  sessionId: AssistantRuntimeSessionIdSchema,
  sequence: AssistantRuntimeSequenceSchema,
  direction: AssistantRuntimePageDirectionSchema,
});

const AssistantRuntimeErrorDetailValueSchema = z.union([
  z.string().max(512),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const AssistantRuntimeErrorSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  code: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().min(1).max(1024),
  retry: AssistantRuntimeRetryClassificationSchema,
  retryAfterMs: z.int().positive().optional(),
  correlationId: AssistantRuntimeCorrelationIdSchema,
  details: z
    .record(z.string().min(1).max(64), AssistantRuntimeErrorDetailValueSchema)
    .optional(),
});

const AssistantRuntimeCommandAcceptedSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  commandId: AssistantRuntimeCommandIdSchema,
  correlationId: AssistantRuntimeCorrelationIdSchema,
  acceptedAt: AssistantRuntimeTimestampSchema,
  resource: AssistantRuntimeResourceReferenceSchema,
});

type AssistantRuntimeSchemaVersion = z.output<typeof AssistantRuntimeSchemaVersionSchema>;
type AssistantRuntimeId = z.output<typeof AssistantRuntimeIdSchema>;
type AssistantRuntimeCorrelationId = z.output<typeof AssistantRuntimeCorrelationIdSchema>;
type AssistantRuntimeCommandId = z.output<typeof AssistantRuntimeCommandIdSchema>;
type AssistantRuntimeEventId = z.output<typeof AssistantRuntimeEventIdSchema>;
type AssistantRuntimeSessionId = z.output<typeof AssistantRuntimeSessionIdSchema>;
type AssistantRuntimeRunId = z.output<typeof AssistantRuntimeRunIdSchema>;
type AssistantRuntimeTimestamp = z.output<typeof AssistantRuntimeTimestampSchema>;
type AssistantRuntimeResourceVersion = z.output<
  typeof AssistantRuntimeResourceVersionSchema
>;
type AssistantRuntimeSequence = z.output<typeof AssistantRuntimeSequenceSchema>;
type AssistantRuntimeRetryClassification = z.output<
  typeof AssistantRuntimeRetryClassificationSchema
>;
type AssistantRuntimeCommandMetadata = z.output<
  typeof AssistantRuntimeCommandMetadataSchema
>;
type AssistantRuntimeResourceReference = z.output<
  typeof AssistantRuntimeResourceReferenceSchema
>;
type AssistantRuntimePageDirection = z.output<typeof AssistantRuntimePageDirectionSchema>;
type AssistantRuntimePageCursor = z.output<typeof AssistantRuntimePageCursorSchema>;
type AssistantRuntimeError = z.output<typeof AssistantRuntimeErrorSchema>;
type AssistantRuntimeCommandAccepted = z.output<
  typeof AssistantRuntimeCommandAcceptedSchema
>;

export type {
  AssistantRuntimeCommandAccepted,
  AssistantRuntimeCommandId,
  AssistantRuntimeCommandMetadata,
  AssistantRuntimeCorrelationId,
  AssistantRuntimeError,
  AssistantRuntimeEventId,
  AssistantRuntimeId,
  AssistantRuntimePageCursor,
  AssistantRuntimePageDirection,
  AssistantRuntimeResourceReference,
  AssistantRuntimeResourceVersion,
  AssistantRuntimeRetryClassification,
  AssistantRuntimeRunId,
  AssistantRuntimeSchemaVersion,
  AssistantRuntimeSequence,
  AssistantRuntimeSessionId,
  AssistantRuntimeTimestamp,
};
export {
  AssistantRuntimeCommandAcceptedSchema,
  AssistantRuntimeCommandIdSchema,
  AssistantRuntimeCommandMetadataSchema,
  AssistantRuntimeCorrelationIdSchema,
  AssistantRuntimeErrorSchema,
  AssistantRuntimeEventIdSchema,
  AssistantRuntimeIdSchema,
  AssistantRuntimePageCursorSchema,
  AssistantRuntimePageDirectionSchema,
  AssistantRuntimeResourceReferenceSchema,
  AssistantRuntimeResourceVersionSchema,
  AssistantRuntimeRetryClassificationSchema,
  AssistantRuntimeRunIdSchema,
  AssistantRuntimeSchemaVersionSchema,
  AssistantRuntimeSequenceSchema,
  AssistantRuntimeSessionIdSchema,
  AssistantRuntimeTimestampSchema,
};
