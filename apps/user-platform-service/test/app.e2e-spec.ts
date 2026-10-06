import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { SharedHealthProbeResponseSchema } from '@repo/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('UserPlatform bootstrap (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['/health/live', '/health/ready'])('%s returns a valid probe', async path => {
    await request(app.getHttpServer())
      .get(path)
      .expect(200)
      .expect(response => {
        expect(SharedHealthProbeResponseSchema.parse(response.body).status).toBe('ok');
      });
  });

  it('/health/whoami identifies the service without cacheable data', () => {
    const correlationId = 'corr-user-platform-e2e';
    return request(app.getHttpServer())
      .get('/health/whoami')
      .set('x-correlation-id', correlationId)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect('x-correlation-id', correlationId)
      .expect(response => {
        expect(response.body).toMatchObject({
          status: 'ok',
          service: 'user-platform-service',
          version: 'e2e-test',
          buildId: 'e2e-build',
          correlationId,
        });
      });
  });
});
