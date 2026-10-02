import { Test, type TestingModule } from '@nestjs/testing';
import {
  HealthProbeResponseSchema,
  ServiceIdentityResponseSchema,
} from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';
import { HealthModule } from './health.module.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    controller = module.get(HealthController);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports the process as live', async () => {
    const response = await controller.getLiveness();

    expect(HealthProbeResponseSchema.safeParse(response).success).toBe(true);
    expect(response.status).toBe('ok');
  });

  it('reports the service as ready while no required dependencies exist', async () => {
    const response = await controller.getReadiness();

    expect(HealthProbeResponseSchema.safeParse(response).success).toBe(true);
    expect(response.status).toBe('ok');
  });

  it('returns a validated instance identity', () => {
    const response = controller.getIdentity();

    expect(ServiceIdentityResponseSchema.safeParse(response).success).toBe(
      true,
    );
    expect(response.service).toBe('agentic-rag-business-service');
  });

  it('reports Railway deployment identity and commit version', () => {
    vi.stubEnv('RAILWAY_REPLICA_ID', 'replica-123');
    vi.stubEnv('RAILWAY_DEPLOYMENT_ID', 'deployment-456');
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', 'commit-789');

    const response = controller.getIdentity();

    expect(response.instanceId).toBe('replica-123');
    expect(response.deploymentId).toBe('deployment-456');
    expect(response.version).toBe('commit-789');
  });
});
