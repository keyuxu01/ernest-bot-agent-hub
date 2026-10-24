import { SearchIndexService } from './../src/infrastructure/elasticsearch/search-index.service';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  RagBusinessGreetingResponseSchema,
  SharedHealthProbeResponseSchema,
  SharedServiceIdentityResponseSchema,
} from '@repo/contracts';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { VectorIndexService } from './../src/infrastructure/elasticsearch/vector-index.service';
import { GraphStoreService } from './../src/infrastructure/neo4j/graph-store.service';
import { RabbitMqService } from './../src/infrastructure/rabbitmq/rabbitmq.service';
import { AppModule } from './../src/app.module';
import { MAX_UPLOAD_FILE_BYTES } from './../src/modules/document/constants/document-upload.constants';
import { DocumentEntity } from './../src/modules/document/entities/document.entity';
import { DocumentContent } from './../src/modules/document/schemas/document-content.schema';

describe('Business service (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RabbitMqService)
      .useValue({
        isReady: () => true,
        registeredHandlerCount: 1,
        registerHandler: () => undefined,
        publish: async () => true,
      })
      .overrideProvider(SearchIndexService)
      .useValue({
        indexDocument: async () => undefined,
        deleteDocument: async () => undefined,
      })
      .overrideProvider(VectorIndexService)
      .useValue({
        deleteByDocId: async () => undefined,
        indexChunks: async () => undefined,
      })
      // Neo4j 启动时会连库并建约束；e2e 只验 HTTP 面，替换为空实现
      .overrideProvider(GraphStoreService)
      .useValue({
        upsertDocument: async () => undefined,
        upsertChunk: async () => undefined,
        writeExtraction: async () => 0,
        deleteByDocId: async () => undefined,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ message: 'Hello World!' })
      .expect((response) => {
        expect(
          RagBusinessGreetingResponseSchema.safeParse(response.body).success,
        ).toBe(true);
      });
  });

  it('/api/greeting (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/greeting')
      .expect(200)
      .expect({ message: 'Hello World!' })
      .expect((response) => {
        expect(
          RagBusinessGreetingResponseSchema.safeParse(response.body).success,
        ).toBe(true);
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

  it('/health/live (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect((response) => {
        expect(
          SharedHealthProbeResponseSchema.safeParse(response.body).success,
        ).toBe(true);
        expect(response.body.status).toBe('ok');
      });
  });

  it('/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect((response) => {
        expect(
          SharedHealthProbeResponseSchema.safeParse(response.body).success,
        ).toBe(true);
        expect(response.body.status).toBe('ok');
      });
  });

  it('/health/whoami (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/whoami')
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect((response) => {
        expect(
          SharedServiceIdentityResponseSchema.safeParse(response.body).success,
        ).toBe(true);
      });
  });

  it('registers the document persistence models', () => {
    const dataSource = app.get(DataSource);

    expect(dataSource.hasMetadata(DocumentEntity)).toBe(true);
    expect(app.get(getModelToken(DocumentContent.name))).toBeDefined();
  });

  it('/documents/upload/parse (POST) requires a file', () => {
    return request(app.getHttpServer())
      .post('/documents/upload/parse')
      .field('title', 'no file')
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('DOCUMENT_FILE_REQUIRED');
      });
  });

  it('/documents/upload/parse (POST) rejects unsupported file types', () => {
    return request(app.getHttpServer())
      .post('/documents/upload/parse')
      .attach('file', Buffer.from('MZ'), 'tool.exe')
      .expect(415)
      .expect((response) => {
        expect(response.body.code).toBe('DOCUMENT_FILE_TYPE_UNSUPPORTED');
      });
  });

  it('/documents/upload/parse (POST) rejects files over 50 MB', () => {
    return request(app.getHttpServer())
      .post('/documents/upload/parse')
      .attach('file', Buffer.alloc(MAX_UPLOAD_FILE_BYTES + 1), 'big.txt')
      .expect(413)
      .expect((response) => {
        expect(response.body.code).toBe('DOCUMENT_FILE_TOO_LARGE');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
