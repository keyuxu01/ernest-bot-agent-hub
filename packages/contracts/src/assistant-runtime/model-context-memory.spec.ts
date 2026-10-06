import { describe, expect, it } from 'vitest';
import {
  AssistantRuntimeCapabilityStateSchema,
  AssistantRuntimeContextSourceSchema,
  AssistantRuntimeContextSnapshotSchema,
  AssistantRuntimeHookConfigurationSchema,
  AssistantRuntimeHookOutcomeSchema,
  AssistantRuntimeHookTypeSchema,
  AssistantRuntimeHttpsUrlSchema,
  AssistantRuntimeMemoryOperationSchema,
  AssistantRuntimeMemoryOperationStatusSchema,
  AssistantRuntimeMemoryScopeSchema,
  AssistantRuntimeModelCapabilitySchema,
  AssistantRuntimeModelSelectionSchema,
  AssistantRuntimeNormalizedUsageSchema,
  AssistantRuntimeProviderAccountUsageSchema,
  AssistantRuntimeProviderConnectionInputSchema,
  AssistantRuntimeProviderConnectionReferenceSchema,
} from './model-context-memory';

const hash = 'a'.repeat(64);

describe('assistant model/context/memory contracts', () => {
  it('accepts a user-owned HTTPS connection and free-form model parameters', () => {
    expect(AssistantRuntimeProviderConnectionInputSchema.parse({ schemaVersion: 1, baseUrl: 'https://models.example.test/v1', apiKey: 'test-secret', model: 'custom/model-v7' })).toMatchObject({ model: 'custom/model-v7' });
    expect(AssistantRuntimeModelSelectionSchema.parse({ schemaVersion: 1, connectionId: 'connection-1', model: 'custom/model-v7', reasoningEffort: 'high', serviceTier: 'priority' })).toMatchObject({ reasoningEffort: 'high' });
  });

  it('rejects cleartext provider endpoints and keeps plaintext keys out of references', () => {
    expect(() => AssistantRuntimeProviderConnectionInputSchema.parse({ schemaVersion: 1, baseUrl: 'http://models.example.test', apiKey: 'secret', model: 'm' })).toThrow();
    const reference = AssistantRuntimeProviderConnectionReferenceSchema.parse({ schemaVersion: 1, connectionId: 'connection-1', resourceVersion: 1, baseUrl: 'https://models.example.test', keyHint: '…1234', revoked: false, apiKey: 'must-strip' });
    expect(reference).not.toHaveProperty('apiKey');
    expect(() => AssistantRuntimeProviderConnectionReferenceSchema.parse({ schemaVersion: 1, connectionId: 'connection-1', resourceVersion: 1, baseUrl: 'https://plain-secret@models.example.test', keyHint: 'plain-secret', revoked: false })).toThrow();
  });

  it('represents supported, unsupported and unknown model capabilities explicitly', () => {
    const catalog = AssistantRuntimeModelCapabilitySchema.parse({ schemaVersion: 1, catalogVersion: 2, connectionId: 'connection-1', model: 'm', contextTokens: 128000, outputTokens: null, streaming: 'supported', reasoning: 'unknown', tools: 'unsupported', parallelTools: 'unknown', images: 'unsupported', structuredOutput: 'supported', usage: 'supported', cache: 'unknown', serviceTier: 'unknown' });
    expect(catalog).toMatchObject({ tools: 'unsupported', outputTokens: null });
  });

  it('binds a relative hashed context manifest and rejects path escape', () => {
    const valid = { schemaVersion: 1, snapshotId: 'snapshot-1', workspaceId: 'workspace-1', manifestSha256: hash, sources: [{ relativePath: 'skills/review/SKILL.md', sha256: hash, kind: 'skill', trust: 'user_selected', contentReference: 'artifact-1' }], acceptedAt: '2026-10-05T17:00:00+08:00' };
    expect(AssistantRuntimeContextSnapshotSchema.parse(valid).sources).toHaveLength(1);
    for (const relativePath of ['../secret', '..\\secret', 'C:\\secret', 'C:secret']) {
      expect(() => AssistantRuntimeContextSnapshotSchema.parse({ ...valid, sources: [{ ...valid.sources[0], relativePath }] })).toThrow('Context path must stay relative');
    }
  });

  it('supports only managed Mem0 operations with owner/session scope', () => {
    expect(AssistantRuntimeMemoryOperationSchema.parse({ schemaVersion: 1, operationId: 'memory-op-1', memoryProvider: 'mem0_platform', memoryScope: { scope: 'session', sessionId: 'session-1' }, operation: 'recall', query: 'preferences', topK: 5 })).toMatchObject({ operation: 'recall' });
    expect(() => AssistantRuntimeMemoryOperationSchema.parse({ schemaVersion: 1, operationId: 'memory-op-2', memoryProvider: 'self_hosted', memoryScope: { scope: 'owner' }, operation: 'delete', memoryId: 'memory-1' })).toThrow();
  });

  it('captures all seven ordered Hook types with finite limits', () => {
    const types = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'PreCompact', 'PostCompact', 'UnhandledError'];
    const controlling = new Set(['PreToolUse', 'UserPromptSubmit', 'Stop']);
    const parsed = AssistantRuntimeHookConfigurationSchema.parse({ schemaVersion: 1, configurationVersion: 1, hooks: types.map((type, ordinal) => ({ hookId: `hook-${ordinal}`, type, ordinal, timeoutMs: 5000, failPolicy: controlling.has(type) ? 'closed' : 'notify_only', localCapabilityReference: 'binding-1' })) });
    expect(parsed.hooks.map(hook => hook.type)).toEqual(types);
    expect(() => AssistantRuntimeHookConfigurationSchema.parse({ schemaVersion: 1, configurationVersion: 1, hooks: [{ hookId: 'hook-1', type: 'PreToolUse', ordinal: 0, timeoutMs: 0, failPolicy: 'closed', localCapabilityReference: 'binding-1' }] })).toThrow();
    expect(() => AssistantRuntimeHookConfigurationSchema.parse({ schemaVersion: 1, configurationVersion: 1, hooks: [{ hookId: 'hook-1', type: 'PreToolUse', ordinal: 1, timeoutMs: 1, failPolicy: 'closed', localCapabilityReference: 'binding-1' }] })).toThrow('Hook ordinals must be unique');
    expect(AssistantRuntimeHookOutcomeSchema.parse({ outcome: 'blocked', hookType: 'PreToolUse', reason: 'policy' })).toMatchObject({ outcome: 'blocked' });
    expect(() => AssistantRuntimeHookOutcomeSchema.parse({ outcome: 'blocked', hookType: 'PostToolUse', reason: 'policy' })).toThrow();
    expect(() => AssistantRuntimeHookOutcomeSchema.parse({ outcome: 'continuation_requested', hookType: 'PreToolUse', instruction: 'again' })).toThrow();
    expect(() => AssistantRuntimeHookConfigurationSchema.parse({ schemaVersion: 1, configurationVersion: 1, hooks: [{ hookId: 'hook-1', type: 'UnhandledError', ordinal: 0, timeoutMs: 1, failPolicy: 'closed', localCapabilityReference: 'binding-1' }] })).toThrow('UnhandledError must use notify_only');
  });

  it('validates every exported leaf vocabulary explicitly', () => {
    const leafCases: Array<[schema: { parse: (value: unknown) => unknown }, valid: unknown, invalid: unknown]> = [
      [AssistantRuntimeHttpsUrlSchema, 'https://service.example.test', 'http://service.example.test'],
      [AssistantRuntimeCapabilityStateSchema, 'unknown', 'maybe'],
      [AssistantRuntimeContextSourceSchema, { relativePath: 'AGENTS.md', sha256: hash, kind: 'agents', trust: 'workspace_instruction', contentReference: 'inline-1' }, { relativePath: '/etc/passwd', sha256: hash, kind: 'agents', trust: 'workspace_instruction', contentReference: 'inline-1' }],
      [AssistantRuntimeMemoryScopeSchema, { scope: 'owner' }, { scope: 'session' }],
      [AssistantRuntimeMemoryOperationStatusSchema, 'incomplete_retryable', 'failed_forever'],
      [AssistantRuntimeHookTypeSchema, 'PreToolUse', 'BeforeAnything'],
    ];
    for (const [schema, valid, invalid] of leafCases) {
      expect(() => schema.parse(valid)).not.toThrow();
      expect(() => schema.parse(invalid)).toThrow();
    }
  });

  it('keeps unavailable usage distinct from zero and exposes no billing actions', () => {
    const usage = AssistantRuntimeNormalizedUsageSchema.parse({ availability: 'unavailable' });
    const account = AssistantRuntimeProviderAccountUsageSchema.parse({ availability: 'unavailable' });
    expect(usage).not.toHaveProperty('totalTokens');
    expect(account).not.toHaveProperty('balance');
    expect(JSON.stringify({ usage, account })).not.toMatch(/charge|top.?up|invoice|payment/i);
  });

  it('requires provider timestamps for provider-reported usage and balance', () => {
    expect(() => AssistantRuntimeNormalizedUsageSchema.parse({ availability: 'provider_reported', inputTokens: 1, outputTokens: 2, totalTokens: 3, cost: null, priceVersion: null })).toThrow();
    expect(() => AssistantRuntimeProviderAccountUsageSchema.parse({ availability: 'provider_reported', balance: 10, currency: 'USD', resetAt: null })).toThrow();
  });

  it('rejects a key invalid field for each public aggregate schema', () => {
    const invalidCases: Array<[schema: { parse: (value: unknown) => unknown }, value: unknown]> = [
      [AssistantRuntimeProviderConnectionReferenceSchema, { schemaVersion: 1, connectionId: '', resourceVersion: 1, baseUrl: 'https://models.example.test', keyHint: '…1234', revoked: false }],
      [AssistantRuntimeModelSelectionSchema, { schemaVersion: 1, connectionId: 'connection-1', model: '' }],
      [AssistantRuntimeModelCapabilitySchema, { schemaVersion: 1, catalogVersion: 1, connectionId: 'connection-1', model: 'm', contextTokens: 1, outputTokens: 1, streaming: 'maybe', reasoning: 'unknown', tools: 'unknown', parallelTools: 'unknown', images: 'unknown', structuredOutput: 'unknown', usage: 'unknown', cache: 'unknown', serviceTier: 'unknown' }],
      [AssistantRuntimeHookOutcomeSchema, { outcome: 'notification_failed', hookType: 'UnhandledError', code: '' }],
      [AssistantRuntimeNormalizedUsageSchema, { availability: 'estimated', inputTokens: -1, outputTokens: 1, totalTokens: 0, cost: null, priceVersion: null }],
      [AssistantRuntimeProviderAccountUsageSchema, { availability: 'provider_reported', balance: -1, currency: 'USD', resetAt: null, providerTimestamp: '2026-10-05T17:00:00+08:00' }],
    ];
    for (const [schema, value] of invalidCases) expect(() => schema.parse(value)).toThrow();
  });
});
