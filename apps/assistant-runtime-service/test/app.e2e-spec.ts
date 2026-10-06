import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { StructuredDiagnosticLogger } from '../src/infrastructure/observability/structured-diagnostic-logger';

describe('Assistant Runtime diagnostics (e2e)', () => {
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

  it('returns the caller correlation and stable build metadata', async () => {
    const correlationId = 'corr-runtime-e2e';
    const diagnosticLogger = app.get(StructuredDiagnosticLogger);
    const log = vi.spyOn(diagnosticLogger, 'log');
    await request(app.getHttpServer())
      .get('/assistant/ping')
      .set('x-correlation-id', correlationId)
      .expect(200)
      .expect('x-correlation-id', correlationId)
      .expect(response => {
        expect(response.body).toMatchObject({
          correlationId,
          version: 'e2e-test',
          buildId: 'e2e-build',
        });
      });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'assistant.diagnostic.ping',
        correlationId,
        version: 'e2e-test',
        buildId: 'e2e-build',
      }),
    );
  });

  it('preserves the diagnostic SSE echo behavior', async () => {
    await request(app.getHttpServer())
      .get('/assistant/stream')
      .query({ prompt: 'hello' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/)
      .expect(response => {
        expect(response.text).toContain('Echo from assistant runtime: hello');
        expect(response.text).toContain('"phase":"completed"');
      });
  });
});
