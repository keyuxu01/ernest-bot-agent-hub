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
import {
  DocumentEntity,
  DocumentStatus,
} from './../src/modules/document/entities/document.entity';
import { DocumentReviewEntity } from './../src/modules/document/entities/document-review.entity';
import { DocumentContent } from './../src/modules/document/schemas/document-content.schema';

const E2E_PASSWORD = 'e2e-password-123';

describe('Business service (e2e)', () => {
  let app: INestApplication;
  let createdUserIds: string[] = [];
  let createdDocumentIds: string[] = [];

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
    expect(dataSource.hasMetadata(DocumentReviewEntity)).toBe(true);
    expect(app.get(getModelToken(DocumentContent.name))).toBeDefined();
  });

  it('rejects protected routes without a valid access token', async () => {
    await request(app.getHttpServer()).get('/documents').expect(401);

    // refresh token 不能当 access token 用
    const username = `e2e_${Date.now()}_r`;
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: E2E_PASSWORD })
      .expect(201);
    createdUserIds.push(registered.body.userId);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: E2E_PASSWORD })
      .expect(201);
    await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${login.body.refreshToken}`)
      .expect(401);
  });

  it('registers, logs in and resolves the current user', async () => {
    const { token, userId, username } = await loginAsNewUser();

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({ userId, username, roles: ['ROLE_USER'] });
    expect(me.body).not.toHaveProperty('password');

    const wrong = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'wrong-password' })
      .expect(401);
    expect(wrong.body.message).toBe('用户名或密码错误');

    const duplicate = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: E2E_PASSWORD })
      .expect(409);
    expect(duplicate.body.message).toBe('用户名已存在');
  });

  it('runs the publish review flow with role checks', async () => {
    const author = await loginAsNewUser();
    const reviewer = await loginAsNewUser(['ROLE_REVIEWER']);
    const server = app.getHttpServer();
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    const created = await request(server)
      .post('/documents')
      .set(as(author.token))
      .send({ title: 'e2e 审核流', content: '# e2e\n\n正文' })
      .expect(201);
    const documentId: string = created.body.id;
    createdDocumentIds.push(documentId);
    expect(created.body).toMatchObject({
      status: DocumentStatus.Draft,
      createBy: author.userId,
      authorId: author.userId,
    });

    // 默认开启审核：publish 进入待审，重复提审被拒
    const published = await request(server)
      .put(`/documents/${documentId}/publish`)
      .set(as(author.token))
      .expect(200);
    expect(published.body.status).toBe(DocumentStatus.PendingReview);
    const again = await request(server)
      .post(`/documents/${documentId}/reviews/submit`)
      .set(as(author.token))
      .expect(400);
    expect(again.body.code).toBe('DOCUMENT_REVIEW_ALREADY_PENDING');

    const current = await request(server)
      .get(`/documents/${documentId}/reviews/current`)
      .set(as(author.token))
      .expect(200);
    const taskId: string = current.body.id;

    // 普通用户不能审核，也不能伪造审核人
    await request(server)
      .post(`/documents/reviews/tasks/${taskId}/approve`)
      .set(as(author.token))
      .send({})
      .expect(403);
    await request(server)
      .post(`/documents/reviews/tasks/${taskId}/approve`)
      .set(as(reviewer.token))
      .send({ reviewerId: author.userId })
      .expect(400);

    const approved = await request(server)
      .post(`/documents/reviews/tasks/${taskId}/approve`)
      .set(as(reviewer.token))
      .send({ reviewComment: '通过' })
      .expect(201);
    expect(approved.body.status).toBe(DocumentStatus.Published);

    // 并发 / 重复结案：同一任务第二次处理被拒
    const closed = await request(server)
      .post(`/documents/reviews/tasks/${taskId}/reject`)
      .set(as(reviewer.token))
      .send({ reviewComment: '再驳回' })
      .expect(400);
    expect(closed.body.code).toBe('DOCUMENT_REVIEW_ALREADY_CLOSED');

    const history = await request(server)
      .get(`/documents/${documentId}/reviews/history`)
      .set(as(author.token))
      .expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({
        id: taskId,
        reviewResult: 1,
        reviewerId: reviewer.userId,
        reviewComment: '通过',
      }),
    ]);

    // 开启审核时已发布文档不能直接改正文
    const edit = await request(server)
      .patch(`/documents/${documentId}`)
      .set(as(author.token))
      .send({ content: '改稿' })
      .expect(400);
    expect(edit.body.code).toBe('DOCUMENT_PUBLISHED_EDIT_REQUIRES_DRAFT');
  });

  it('/documents/upload/parse (POST) requires a file', async () => {
    const { token } = await loginAsNewUser();
    return request(app.getHttpServer())
      .post('/documents/upload/parse')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'no file')
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('DOCUMENT_FILE_REQUIRED');
      });
  });

  it('/documents/upload/parse (POST) rejects unsupported file types', async () => {
    const { token } = await loginAsNewUser();
    return request(app.getHttpServer())
      .post('/documents/upload/parse')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('MZ'), 'tool.exe')
      .expect(415)
      .expect((response) => {
        expect(response.body.code).toBe('DOCUMENT_FILE_TYPE_UNSUPPORTED');
      });
  });

  it('/documents/upload/parse (POST) rejects files over 50 MB', async () => {
    const { token } = await loginAsNewUser();
    return request(app.getHttpServer())
      .post('/documents/upload/parse')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.alloc(MAX_UPLOAD_FILE_BYTES + 1), 'big.txt')
      .expect(413)
      .expect((response) => {
        expect(response.body.code).toBe('DOCUMENT_FILE_TOO_LARGE');
      });
  });

  afterEach(async () => {
    // 清理本用例写入真实 PG 的测试账号与文档（文档只能软删，物理删除避免堆积）
    const dataSource = app.get(DataSource);
    if (createdDocumentIds.length) {
      await dataSource.query(
        'DELETE FROM kh_document_review WHERE document_id = ANY($1::bigint[])',
        [createdDocumentIds],
      );
      await dataSource.query(
        'DELETE FROM kh_document WHERE id = ANY($1::bigint[])',
        [createdDocumentIds],
      );
    }
    if (createdUserIds.length) {
      await dataSource.query(
        'DELETE FROM kh_user_role WHERE user_id = ANY($1::bigint[])',
        [createdUserIds],
      );
      await dataSource.query(
        'DELETE FROM kh_user WHERE id = ANY($1::bigint[])',
        [createdUserIds],
      );
    }
    createdDocumentIds = [];
    createdUserIds = [];
    await app.close();
  });

  /** 注册一个唯一用户名的账号（可额外授予角色）并登录 */
  async function loginAsNewUser(extraRoles: string[] = []) {
    const username = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: E2E_PASSWORD })
      .expect(201);
    const userId: string = registered.body.userId;
    createdUserIds.push(userId);

    for (const roleCode of extraRoles) {
      await app.get(DataSource).query(
        `INSERT INTO kh_user_role (id, user_id, role_id)
         SELECT $1, $2, id FROM kh_role WHERE role_code = $3`,
        [`${Date.now()}${Math.floor(Math.random() * 1e5)}`, userId, roleCode],
      );
    }

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: E2E_PASSWORD })
      .expect(201);
    return { token: login.body.accessToken as string, userId, username };
  }
});
