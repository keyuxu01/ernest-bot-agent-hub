import { describe, expect, it } from 'vitest';
import { AssistantRuntimeDurableEventSchema, AssistantRuntimeSseFrameSchema } from './events';

const event = { schemaVersion: 1, eventId: 'event-1', sessionId: 'session-1', runId: 'run-1', sequence: 9, occurredAt: '2026-10-05T17:00:00+08:00', type: 'tool', payloadVersion: 1, payload: { type: 'tool', toolExecutionId: 'tool-1', phase: 'completed' } };
const artifactReference = { schemaVersion: 1, artifactId: 'artifact-1', referenceId: 'reference-1', resourceVersion: 1, contentSha256: 'a'.repeat(64), mimeType: 'image/png', byteSize: 12 };

describe('assistant durable event and SSE contracts', () => {
  it('round-trips a durable business event without provider fields', () => {
    const parsed = AssistantRuntimeDurableEventSchema.parse(event);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(parsed.payload).not.toHaveProperty('providerPayload');
  });

  it('keeps heartbeat separate from durable sequence', () => {
    const heartbeat = AssistantRuntimeSseFrameSchema.parse({ schemaVersion: 1, frameType: 'heartbeat', emittedAt: '2026-10-05T17:00:01+08:00' });
    expect(heartbeat).not.toHaveProperty('sequence');
    expect(heartbeat).not.toHaveProperty('eventId');
  });

  it('carries the durable identity inside an event frame', () => {
    expect(AssistantRuntimeSseFrameSchema.parse({ ...event, frameType: 'event' })).toMatchObject({ sequence: 9, eventId: 'event-1' });
  });

  it.each([
    { type: 'usage', source: 'unavailable' },
    { type: 'interrupt', interruptId: 'interrupt-1', phase: 'requested' },
    { type: 'artifact', state: 'committed', reference: artifactReference },
    { type: 'terminal', state: 'Succeeded' },
  ])('round-trips $type without provider-specific fields', payload => {
    const parsed = AssistantRuntimeDurableEventSchema.parse({ ...event, type: payload.type, payload });
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(JSON.stringify(parsed)).not.toContain('providerPayload');
  });

  it('does not fabricate numeric usage when it is unavailable', () => {
    const parsed = AssistantRuntimeDurableEventSchema.parse({ ...event, type: 'usage', payload: { type: 'usage', source: 'unavailable' } });
    expect(parsed.payload).not.toHaveProperty('inputTokens');
  });

  it('rejects a frame whose routing type disagrees with its payload', () => {
    expect(() => AssistantRuntimeSseFrameSchema.parse({ ...event, frameType: 'event', type: 'message', payload: { type: 'terminal', state: 'Succeeded' } })).toThrow('Event type must match payload type');
  });

  it('rejects a business event without a sequence', () => {
    const invalid = { ...event } as Record<string, unknown>;
    delete invalid.sequence;
    expect(() => AssistantRuntimeDurableEventSchema.parse(invalid)).toThrow();
  });
});
