import { Test, TestingModule } from '@nestjs/testing';
import { GreetingResponseSchema } from '@repo/contracts';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ message: 'Hello World!' })
      .expect((response) => {
        expect(GreetingResponseSchema.safeParse(response.body).success).toBe(
          true,
        );
      });
  });

  it('/api/greeting (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/greeting')
      .expect(200)
      .expect({ message: 'Hello World!' })
      .expect((response) => {
        expect(GreetingResponseSchema.safeParse(response.body).success).toBe(
          true,
        );
      });
  });

  it('/openapi.json (GET)', () => {
    return request(app.getHttpServer())
      .get('/openapi.json')
      .expect(200)
      .expect((response) => {
        expect(response.body.openapi).toBe('3.1.1');
        expect(response.body.paths?.['/api/greeting']?.get).toMatchObject({
          summary: 'Get the service greeting',
          tags: ['Greeting'],
        });
        expect(
          response.body.paths?.['/api/greeting']?.get?.responses?.['200'],
        ).toBeDefined();
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
