import { describe, expect, it } from 'vitest';
import {
  AssistantRuntimeCommandAcceptedSchema,
  AssistantRuntimeCommandMetadataSchema,
  AssistantRuntimeErrorSchema,
  AssistantRuntimePageCursorSchema,
} from './protocol';

describe('assistant runtime protocol contracts', () => {
  it('accepts an idempotent versioned command envelope', () => {
    expect(
      AssistantRuntimeCommandMetadataSchema.parse({
        schemaVersion: 1,
        commandId: 'cmd_01JTEST',
        expectedVersion: 7,
      }),
    ).toEqual({
      schemaVersion: 1,
      commandId: 'cmd_01JTEST',
      expectedVersion: 7,
    });
  });

  it('accepts a durable command acceptance response', () => {
    expect(
      AssistantRuntimeCommandAcceptedSchema.parse({
        schemaVersion: 1,
        commandId: 'cmd_01JTEST',
        correlationId: 'cor_01JTEST',
        acceptedAt: '2026-10-05T12:00:00+08:00',
        resource: {
          schemaVersion: 1,
          resourceId: 'run_01JTEST',
          resourceVersion: 1,
        },
      }).resource.resourceId,
    ).toBe('run_01JTEST');
  });

  it('keeps history cursors bound to a session and direction', () => {
    expect(
      AssistantRuntimePageCursorSchema.parse({
        schemaVersion: 1,
        sessionId: 'session_01JTEST',
        sequence: 42,
        direction: 'before',
      }),
    ).toMatchObject({ sequence: 42, direction: 'before' });
  });

  it('rejects an unknown protocol generation', () => {
    expect(() =>
      AssistantRuntimeCommandMetadataSchema.parse({
        schemaVersion: 2,
        commandId: 'cmd_01JTEST',
      }),
    ).toThrow();
  });

  it('rejects a retry-after error without a positive delay', () => {
    expect(() =>
      AssistantRuntimeErrorSchema.parse({
        schemaVersion: 1,
        code: 'PROVIDER_RATE_LIMITED',
        message: 'Try later',
        retry: 'retry_after',
        retryAfterMs: 0,
        correlationId: 'cor_01JTEST',
      }),
    ).toThrow();
  });

  it('rejects nested or secret-shaped diagnostic details', () => {
    expect(() =>
      AssistantRuntimeErrorSchema.parse({
        schemaVersion: 1,
        code: 'COMMAND_REJECTED',
        message: 'Rejected',
        retry: 'not_retryable',
        correlationId: 'cor_01JTEST',
        details: { authorization: { bearer: 'secret' } },
      }),
    ).toThrow();
  });
});
