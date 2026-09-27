import { describe, expect, it } from 'vitest';
import { HealthProbeResponseSchema, ServiceIdentityResponseSchema } from './health.js';

describe('health contracts', () => {
  it('accepts a standard healthy probe response', () => {
    expect(
      HealthProbeResponseSchema.parse({
        status: 'ok',
        info: {},
        error: {},
        details: {},
      }),
    ).toEqual({ status: 'ok', info: {}, error: {}, details: {} });
  });

  it('rejects identity responses that expose an unknown service', () => {
    expect(() =>
      ServiceIdentityResponseSchema.parse({
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
