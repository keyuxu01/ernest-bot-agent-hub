import { z } from 'zod';
import {
  AssistantRuntimeResourceVersionSchema,
  AssistantRuntimeRunIdSchema,
  AssistantRuntimeSchemaVersionSchema,
  AssistantRuntimeSequenceSchema,
  AssistantRuntimeSessionIdSchema,
  AssistantRuntimeTimestampSchema,
} from './protocol';

const AssistantRuntimeHttpsUrlSchema = z.url({ protocol: /^https$/ }).refine(
  value => {
    const url = new URL(value);
    return url.username === '' && url.password === '';
  },
  'HTTPS URL must not contain credentials',
);
const AssistantRuntimeCapabilityStateSchema = z.enum([
  'supported',
  'unsupported',
  'unknown',
]);

const AssistantRuntimeProviderConnectionInputSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  baseUrl: AssistantRuntimeHttpsUrlSchema,
  apiKey: z.string().min(1).max(16_384),
  model: z.string().min(1).max(256),
});

const AssistantRuntimeProviderConnectionReferenceSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  connectionId: z.string().min(1).max(128),
  resourceVersion: AssistantRuntimeResourceVersionSchema,
  baseUrl: AssistantRuntimeHttpsUrlSchema,
  keyHint: z.string().regex(/^…[A-Za-z0-9_-]{4}$/),
  revoked: z.boolean(),
});

const AssistantRuntimeModelSelectionSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  connectionId: z.string().min(1).max(128),
  model: z.string().min(1).max(256),
  reasoningEffort: z.string().min(1).max(64).optional(),
  serviceTier: z.string().min(1).max(64).optional(),
});

const AssistantRuntimeModelCapabilitySchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  catalogVersion: z.int().nonnegative(),
  connectionId: z.string().min(1).max(128),
  model: z.string().min(1).max(256),
  contextTokens: z.int().positive().nullable(),
  outputTokens: z.int().positive().nullable(),
  streaming: AssistantRuntimeCapabilityStateSchema,
  reasoning: AssistantRuntimeCapabilityStateSchema,
  tools: AssistantRuntimeCapabilityStateSchema,
  parallelTools: AssistantRuntimeCapabilityStateSchema,
  images: AssistantRuntimeCapabilityStateSchema,
  structuredOutput: AssistantRuntimeCapabilityStateSchema,
  usage: AssistantRuntimeCapabilityStateSchema,
  cache: AssistantRuntimeCapabilityStateSchema,
  serviceTier: AssistantRuntimeCapabilityStateSchema,
});

const AssistantRuntimeContextSourceSchema = z.object({
  relativePath: z.string().min(1).max(2048).refine(path => {
    const normalized = path.replaceAll('\\', '/');
    return !normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized) && !normalized.split('/').includes('..');
  }, 'Context path must stay relative to the workspace'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(['agents', 'skill', 'explicit']),
  trust: z.enum(['workspace_instruction', 'user_selected', 'untrusted_content']),
  contentReference: z.string().min(1).max(512),
});

const AssistantRuntimeContextSnapshotSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  snapshotId: z.string().min(1).max(128),
  workspaceId: z.string().min(1).max(128),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sources: z.array(AssistantRuntimeContextSourceSchema).max(512),
  acceptedAt: AssistantRuntimeTimestampSchema,
});

const AssistantRuntimeMemoryScopeSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('owner') }),
  z.object({ scope: z.literal('session'), sessionId: AssistantRuntimeSessionIdSchema }),
]);

const memoryBase = {
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  operationId: z.string().min(1).max(128),
  memoryProvider: z.literal('mem0_platform'),
  memoryScope: AssistantRuntimeMemoryScopeSchema,
};

const AssistantRuntimeMemoryOperationSchema = z.discriminatedUnion('operation', [
  z.object({ ...memoryBase, operation: z.literal('recall'), query: z.string().min(1).max(8192), topK: z.int().positive() }),
  z.object({ ...memoryBase, operation: z.literal('extract'), sourceSequences: z.array(AssistantRuntimeSequenceSchema).min(1), runId: AssistantRuntimeRunIdSchema }),
  z.object({ ...memoryBase, operation: z.literal('correct'), memoryId: z.string().min(1).max(256), replacement: z.string().min(1).max(8192) }),
  z.object({ ...memoryBase, operation: z.literal('delete'), memoryId: z.string().min(1).max(256) }),
]);

const AssistantRuntimeMemoryOperationStatusSchema = z.enum([
  'pending',
  'completed',
  'incomplete_retryable',
  'rejected_protected_content',
]);

const AssistantRuntimeHookTypeSchema = z.enum([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'PreCompact',
  'PostCompact',
  'UnhandledError',
]);

const CONTROLLING_HOOK_TYPES = ['PreToolUse', 'UserPromptSubmit', 'Stop'] as const;
const NOTIFICATION_HOOK_TYPES = ['PostToolUse', 'PreCompact', 'PostCompact', 'UnhandledError'] as const;

const AssistantRuntimeHookConfigurationSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  configurationVersion: AssistantRuntimeResourceVersionSchema,
  hooks: z.array(z.object({
    hookId: z.string().min(1).max(128),
    type: AssistantRuntimeHookTypeSchema,
    ordinal: z.int().nonnegative(),
    timeoutMs: z.int().positive(),
    failPolicy: z.enum(['closed', 'notify_only']),
    localCapabilityReference: z.string().min(1).max(256),
  })).max(128),
}).refine(
  value => value.hooks.every((hook, index) => hook.ordinal === index),
  { path: ['hooks'], message: 'Hook ordinals must be unique, contiguous and ordered' },
).superRefine((value, context) => {
  value.hooks.forEach((hook, index) => {
    const expected = (CONTROLLING_HOOK_TYPES as readonly string[]).includes(hook.type) ? 'closed' : 'notify_only';
    if (hook.failPolicy !== expected) {
      context.addIssue({ code: 'custom', path: ['hooks', index, 'failPolicy'], message: `${hook.type} must use ${expected}`, input: hook });
    }
  });
});

const AssistantRuntimeHookOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('allowed'), hookType: z.enum(['PreToolUse', 'UserPromptSubmit']) }),
  z.object({ outcome: z.literal('blocked'), hookType: z.enum(['PreToolUse', 'UserPromptSubmit']), reason: z.string().min(1).max(1024) }),
  z.object({ outcome: z.literal('continuation_requested'), hookType: z.literal('Stop'), instruction: z.string().min(1).max(4096) }),
  z.object({ outcome: z.literal('notified'), hookType: z.enum(NOTIFICATION_HOOK_TYPES) }),
  z.object({ outcome: z.literal('notification_failed'), hookType: z.enum(NOTIFICATION_HOOK_TYPES), code: z.string().min(1).max(128) }),
]);

const tokenUsage = {
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  reasoningTokens: z.int().nonnegative().optional(),
  cachedTokens: z.int().nonnegative().optional(),
  totalTokens: z.int().nonnegative(),
};

const AssistantRuntimeNormalizedUsageSchema = z.discriminatedUnion('availability', [
  z.object({ availability: z.literal('provider_reported'), ...tokenUsage, providerTimestamp: AssistantRuntimeTimestampSchema, cost: z.number().nonnegative().nullable(), priceVersion: z.string().min(1).max(128).nullable() }),
  z.object({ availability: z.literal('estimated'), ...tokenUsage, cost: z.number().nonnegative().nullable(), priceVersion: z.string().min(1).max(128).nullable() }),
  z.object({ availability: z.literal('unavailable') }),
]);

const AssistantRuntimeProviderAccountUsageSchema = z.discriminatedUnion('availability', [
  z.object({ availability: z.literal('provider_reported'), balance: z.number().nonnegative(), currency: z.string().length(3), resetAt: AssistantRuntimeTimestampSchema.nullable(), providerTimestamp: AssistantRuntimeTimestampSchema }),
  z.object({ availability: z.literal('unavailable') }),
]);

type AssistantRuntimeProviderConnectionInput = z.output<typeof AssistantRuntimeProviderConnectionInputSchema>;
type AssistantRuntimeHttpsUrl = z.output<typeof AssistantRuntimeHttpsUrlSchema>;
type AssistantRuntimeCapabilityState = z.output<typeof AssistantRuntimeCapabilityStateSchema>;
type AssistantRuntimeProviderConnectionReference = z.output<typeof AssistantRuntimeProviderConnectionReferenceSchema>;
type AssistantRuntimeModelSelection = z.output<typeof AssistantRuntimeModelSelectionSchema>;
type AssistantRuntimeModelCapability = z.output<typeof AssistantRuntimeModelCapabilitySchema>;
type AssistantRuntimeContextSource = z.output<typeof AssistantRuntimeContextSourceSchema>;
type AssistantRuntimeContextSnapshot = z.output<typeof AssistantRuntimeContextSnapshotSchema>;
type AssistantRuntimeMemoryScope = z.output<typeof AssistantRuntimeMemoryScopeSchema>;
type AssistantRuntimeMemoryOperation = z.output<typeof AssistantRuntimeMemoryOperationSchema>;
type AssistantRuntimeMemoryOperationStatus = z.output<typeof AssistantRuntimeMemoryOperationStatusSchema>;
type AssistantRuntimeHookType = z.output<typeof AssistantRuntimeHookTypeSchema>;
type AssistantRuntimeHookConfiguration = z.output<typeof AssistantRuntimeHookConfigurationSchema>;
type AssistantRuntimeHookOutcome = z.output<typeof AssistantRuntimeHookOutcomeSchema>;
type AssistantRuntimeNormalizedUsage = z.output<typeof AssistantRuntimeNormalizedUsageSchema>;
type AssistantRuntimeProviderAccountUsage = z.output<typeof AssistantRuntimeProviderAccountUsageSchema>;

export type { AssistantRuntimeCapabilityState, AssistantRuntimeContextSnapshot, AssistantRuntimeContextSource, AssistantRuntimeHookConfiguration, AssistantRuntimeHookOutcome, AssistantRuntimeHookType, AssistantRuntimeHttpsUrl, AssistantRuntimeMemoryOperation, AssistantRuntimeMemoryOperationStatus, AssistantRuntimeMemoryScope, AssistantRuntimeModelCapability, AssistantRuntimeModelSelection, AssistantRuntimeNormalizedUsage, AssistantRuntimeProviderAccountUsage, AssistantRuntimeProviderConnectionInput, AssistantRuntimeProviderConnectionReference };
export { AssistantRuntimeCapabilityStateSchema, AssistantRuntimeContextSnapshotSchema, AssistantRuntimeContextSourceSchema, AssistantRuntimeHookConfigurationSchema, AssistantRuntimeHookOutcomeSchema, AssistantRuntimeHookTypeSchema, AssistantRuntimeHttpsUrlSchema, AssistantRuntimeMemoryOperationSchema, AssistantRuntimeMemoryOperationStatusSchema, AssistantRuntimeMemoryScopeSchema, AssistantRuntimeModelCapabilitySchema, AssistantRuntimeModelSelectionSchema, AssistantRuntimeNormalizedUsageSchema, AssistantRuntimeProviderAccountUsageSchema, AssistantRuntimeProviderConnectionInputSchema, AssistantRuntimeProviderConnectionReferenceSchema };
