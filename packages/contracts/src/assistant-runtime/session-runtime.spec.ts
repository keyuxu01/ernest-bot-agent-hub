import { describe, expect, it } from 'vitest';
import { AssistantRuntimeCompactPointSchema, AssistantRuntimeForkResultSchema, AssistantRuntimeModelAttemptSchema, AssistantRuntimeRevertResultSchema, AssistantRuntimeRunSchema, AssistantRuntimeRunStateSchema, AssistantRuntimeSessionCommandSchema, AssistantRuntimeSessionSchema, AssistantRuntimeSessionSettingsSchema, AssistantRuntimeSettingsPatchSchema, AssistantRuntimeTerminalRunStateSchema, AssistantRuntimeTurnSchema } from './session-runtime';
import type { AssistantRuntimeSessionCommand } from './session-runtime';

const commandLabel = (command: AssistantRuntimeSessionCommand): string => {
  switch (command.type) {
    case 'create_session': case 'rename': case 'archive': case 'unarchive': case 'delete': case 'start_run': case 'steer': case 'stop': case 'retry': case 'update_settings': case 'compact': case 'fork': case 'revert': case 'revert_and_edit': return command.type;
    default: return command satisfies never;
  }
};

describe('assistant session/runtime contracts', () => {
  it('enumerates exactly the eleven specified Run states', () => {
    expect(AssistantRuntimeRunStateSchema.options).toEqual(['Queued', 'Running', 'WaitingForLocalTool', 'WaitingForMcpTool', 'WaitingForHuman', 'Compacting', 'Cancelling', 'Succeeded', 'Failed', 'Cancelled', 'ResultUnknown']);
  });

  it('enumerates exactly the four terminal Run states', () => {
    expect(AssistantRuntimeTerminalRunStateSchema.options).toEqual(['Succeeded', 'Failed', 'Cancelled', 'ResultUnknown']);
  });

  it('accepts every public runtime resource schema and rejects its key invalid field', () => {
    const session = { schemaVersion: 1, sessionId: 'session-1', resourceVersion: 1, title: 'Title', archived: false, activeHeadSequence: 2, activeRunId: 'run-1', createdAt: '2026-10-05T17:00:00+08:00', updatedAt: '2026-10-05T17:00:01+08:00' };
    const fixtures: Array<[schema: { parse: (value: unknown) => unknown }, valid: unknown, invalid: unknown]> = [
      [AssistantRuntimeSessionSchema, session, { ...session, sessionId: '' }],
      [AssistantRuntimeRunSchema, { schemaVersion: 1, runId: 'run-1', sessionId: 'session-1', resourceVersion: 1, state: 'Running', fencingToken: 2, startedAt: null, finishedAt: null }, { schemaVersion: 1, runId: 'run-1', sessionId: 'session-1', resourceVersion: 1, state: 'Unknown', fencingToken: 2, startedAt: null, finishedAt: null }],
      [AssistantRuntimeTurnSchema, { schemaVersion: 1, turnId: 'turn-1', runId: 'run-1', ordinal: 0, inputEventSequence: 1 }, { schemaVersion: 1, turnId: '', runId: 'run-1', ordinal: 0, inputEventSequence: 1 }],
      [AssistantRuntimeModelAttemptSchema, { schemaVersion: 1, attemptId: 'attempt-1', turnId: 'turn-1', ordinal: 0, outcome: 'completed' }, { schemaVersion: 1, attemptId: 'attempt-1', turnId: 'turn-1', ordinal: 0, outcome: 'unknown' }],
      [AssistantRuntimeSessionSettingsSchema, { schemaVersion: 1, sessionId: 'session-1', resourceVersion: 1, providerConnectionId: 'provider-1', model: 'model-1', reasoningEffort: null, serviceTier: null }, { schemaVersion: 1, sessionId: 'session-1', resourceVersion: 1, providerConnectionId: '', model: 'model-1', reasoningEffort: null, serviceTier: null }],
      [AssistantRuntimeSettingsPatchSchema, { model: 'model-2' }, { model: '' }],
      [AssistantRuntimeCompactPointSchema, { schemaVersion: 1, compactId: 'compact-1', sessionId: 'session-1', coveredThroughSequence: 3, summaryEventSequence: 4, inputTokens: 10, outputTokens: 2 }, { schemaVersion: 1, compactId: '', sessionId: 'session-1', coveredThroughSequence: 3, summaryEventSequence: 4, inputTokens: 10, outputTokens: 2 }],
      [AssistantRuntimeForkResultSchema, { schemaVersion: 1, sourceSessionId: 'session-1', sourceSequence: 2, targetSession: session }, { schemaVersion: 1, sourceSessionId: '', sourceSequence: 2, targetSession: session }],
      [AssistantRuntimeRevertResultSchema, { schemaVersion: 1, sessionId: 'session-1', resourceVersion: 2, activeHeadSequence: 1, startedRunId: null }, { schemaVersion: 1, sessionId: '', resourceVersion: 2, activeHeadSequence: 1, startedRunId: null }],
    ];
    for (const [schema, valid, invalid] of fixtures) {
      expect(() => schema.parse(valid)).not.toThrow();
      expect(() => schema.parse(invalid)).toThrow();
    }
  });

  it('parses every command variant through an exhaustive consumer', () => {
    const base = { schemaVersion: 1, metadata: { schemaVersion: 1, commandId: 'cmd-1', expectedVersion: 2 }, sessionId: 'session-1' };
    const fixtures = [
      { schemaVersion: 1, metadata: { schemaVersion: 1, commandId: 'cmd-create' }, type: 'create_session' },
      { ...base, type: 'rename', title: 'New title' }, { ...base, type: 'archive' }, { ...base, type: 'unarchive' }, { ...base, type: 'delete' },
      { ...base, type: 'start_run', input: 'hello' }, { ...base, type: 'steer', runId: 'run-1', input: 'continue' }, { ...base, type: 'stop', runId: 'run-1' },
      { ...base, type: 'retry', runId: 'run-1' },
      { ...base, type: 'update_settings', patch: { model: 'custom-model' } }, { ...base, type: 'compact', mode: 'forced' }, { ...base, type: 'fork', atSequence: 7 },
      { ...base, type: 'revert', toSequence: 7 }, { ...base, type: 'revert_and_edit', toSequence: 7, editedInput: 'edited' },
    ];
    expect(fixtures.map(value => commandLabel(AssistantRuntimeSessionCommandSchema.parse(value)))).toHaveLength(14);
  });

  it.each(['update_settings', 'revert', 'revert_and_edit'])('requires expectedVersion for CAS command %s', type => {
    const value: Record<string, unknown> = { schemaVersion: 1, metadata: { schemaVersion: 1, commandId: 'cmd-cas' }, sessionId: 'session-1', type };
    if (type === 'update_settings') value.patch = { model: 'm' };
    if (type !== 'update_settings') value.toSequence = 1;
    if (type === 'revert_and_edit') value.editedInput = 'edited';
    expect(() => AssistantRuntimeSessionCommandSchema.parse(value)).toThrow();
  });

  it('applies the same command ID syntax to CAS commands', () => {
    expect(() => AssistantRuntimeSessionCommandSchema.parse({ schemaVersion: 1, metadata: { schemaVersion: 1, commandId: 'bad command id', expectedVersion: 1 }, sessionId: 'session-1', type: 'update_settings', patch: { model: 'm' } })).toThrow();
  });

  it('rejects an unknown command and protocol generation', () => {
    expect(() => AssistantRuntimeSessionCommandSchema.parse({ schemaVersion: 2, metadata: { schemaVersion: 1, commandId: 'cmd-1' }, sessionId: 'session-1', type: 'suggest_session' })).toThrow();
  });
});
