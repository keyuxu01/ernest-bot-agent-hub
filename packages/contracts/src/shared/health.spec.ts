import { describe, expect, it } from 'vitest';
import {
  SharedHealthProbeResponseSchema,
  SharedServiceIdentityResponseSchema,
} from './health';

describe('shared health contracts', () => {
  it('accepts a standard healthy probe response', () => {
    expect(
      SharedHealthProbeResponseSchema.parse({
        status: 'ok',
        info: {},
        error: {},
        details: {},
      }),
    ).toEqual({ status: 'ok', info: {}, error: {}, details: {} });
  });

  it('accepts agentic-rag-business-service identity', () => {
    expect(
      SharedServiceIdentityResponseSchema.parse({
        status: 'ok',
        service: 'agentic-rag-business-service',
        instanceId: 'local',
        deploymentId: null,
        version: 'development',
        uptimeSeconds: 1,
      }).service,
    ).toBe('agentic-rag-business-service');
  });

  it('rejects identity responses that expose an unknown service', () => {
    expect(() =>
      SharedServiceIdentityResponseSchema.parse({
        status: 'ok',
        service: 'unknown-service',
        instanceId: 'local',
        deploymentId: null,
        version: 'development',
        uptimeSeconds: 1,
      }),
    ).toThrow();
  });
});
