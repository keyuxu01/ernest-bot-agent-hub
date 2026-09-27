import { Test, type TestingModule } from '@nestjs/testing';
import {
  HealthProbeResponseSchema,
  ServiceIdentityResponseSchema,
} from '@repo/contracts';
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
});
