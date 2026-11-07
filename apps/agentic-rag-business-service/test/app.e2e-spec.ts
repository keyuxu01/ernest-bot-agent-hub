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
import { ChatModelService } from './../src/infrastructure/chat-model/chat-model.service';
import { EmbeddingService } from './../src/infrastructure/embedding/embedding.service';
import { RerankerService } from './../src/infrastructure/rerank/reranker.service';
import { MailerService } from '@nestjs-modules/mailer';
import { nextSnowflakeId } from './../src/common/helpers/snowflake-id';
import { RabbitMqService } from './../src/infrastructure/rabbitmq/rabbitmq.service';
import { RedisService } from './../src/infrastructure/redis/redis.service';
import { AppModule } from './../src/app.module';
import { MAX_UPLOAD_FILE_BYTES } from './../src/modules/document/constants/document-upload.constants';
import {
  DocumentEntity,
  DocumentStatus,
} from './../src/modules/document/entities/document.entity';
import { DocumentReviewEntity } from './../src/modules/document/entities/document-review.entity';
import { DocumentContent } from './../src/modules/document/schemas/document-content.schema';

const E2E_PASSWORD = 'e2e-password-123';

/** e2e 发出的邮件（MailerService 替身写入） */
const sentMails: Array<{ to: string; text: string }> = [];

/** RedisService 的内存替身：get / set（含 TTL）/ del / ttl */
function createMemoryRedis() {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  const alive = (key: string) => {
    const entry = store.get(key);
    if (entry?.expiresAt && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    get: async (key: string) => alive(key)?.value ?? null,
    set: async (key: string, value: string, ttlSeconds?: number) => {
      store.set(key, {
        value,
        expiresAt:
          ttlSeconds === undefined ? undefined : Date.now() + ttlSeconds * 1000,
      });
    },
    del: async (key: string) => {
      store.delete(key);
    },
    ttl: async (key: string) => {
      const entry = alive(key);
      if (!entry) return -2;
      if (!entry.expiresAt) return -1;
      return Math.ceil((entry.expiresAt - Date.now()) / 1000);
    },
    incr: async (key: string, ttlSeconds?: number) => {
      const entry = alive(key);
      const next = Number(entry?.value ?? 0) + 1;
      store.set(key, {
        value: String(next),
        expiresAt:
          entry?.expiresAt ??
          (ttlSeconds === undefined
            ? undefined
            : Date.now() + ttlSeconds * 1000),
      });
      return next;
    },
    onModuleDestroy: async () => undefined,
  };
}

describe('Business service (e2e)', () => {
  let app: INestApplication;
  let createdUserIds: string[] = [];
  let createdDocumentIds: string[] = [];
  let createdPermissionIds: string[] = [];
  let createdTeamIds: string[] = [];

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
        searchDocuments: async (params: { keyword: string }) => ({
          items: [{ id: '1', title: params.keyword }],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
      })
      .overrideProvider(VectorIndexService)
      .useValue({
        deleteByDocId: async () => undefined,
        indexChunks: async () => undefined,
        // 混合检索粗排：「无关」问题返回空，其余返回两块
        searchHybrid: async (params: { query: string }) =>
          params.query === '无关'
            ? []
            : [
                {
                  chunkId: 'c1',
                  documentId: '1',
                  documentTitle: '灰度发布 SOP',
                  content: '先金丝雀 1%',
                  heading: '金丝雀',
                  score: 0.03,
                },
                {
                  chunkId: 'c2',
                  documentId: '2',
                  documentTitle: '故障应急',
                  content: 'P0 由王芳指挥',
                  heading: null,
                  score: 0.02,
                },
              ],
      })
      // 外部模型：不调 DashScope
      .overrideProvider(EmbeddingService)
      .useValue({ embed: async () => [0.1, 0.2] })
      .overrideProvider(RerankerService)
      .useValue({ rerank: async () => null })
      .overrideProvider(ChatModelService)
      .useValue({
        // KgExtractionService 构造时会调 model.withStructuredOutput
        model: { withStructuredOutput: () => ({ invoke: async () => ({}) }) },
        answerModel: { invoke: async () => ({ content: '先做金丝雀 [1]。' }) },
      })
      // Neo4j 启动时会连库并建约束；e2e 只验 HTTP 面，替换为空实现
      .overrideProvider(GraphStoreService)
      .useValue({
        upsertDocument: async () => undefined,
        upsertChunk: async () => undefined,
        writeExtraction: async () => 0,
        deleteByDocId: async () => undefined,
        searchGraph: async (keyword: string) => [
          { id: keyword, name: keyword },
        ],
        listNodes: async () => [{ id: '财务部', name: '财务部' }],
        listEdges: async () => [],
      })
      // Redis 用内存实现，e2e 不依赖本地 Redis；SMTP 不发真实邮件，记录最后一封
      .overrideProvider(RedisService)
      .useValue(createMemoryRedis())
      .overrideProvider(MailerService)
      .useValue({
        sendMail: async (mail: { to: string; text: string }) => {
          sentMails.push(mail);
        },
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
    // 作者 / 创建人只取登录用户，请求体传 authorId / createBy 直接被拒
    await request(server)
      .post('/documents')
      .set(as(author.token))
      .send({ title: 'x', content: 'x', authorId: reviewer.userId })
      .expect(400);
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

  it('lets admins manage users and roles', async () => {
    const admin = await loginAsNewUser(['ROLE_ADMIN']);
    const normal = await loginAsNewUser();
    const server = app.getHttpServer();
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    await request(server).get('/users/page').set(as(normal.token)).expect(403);
    await request(server).get('/roles/list').set(as(normal.token)).expect(403);

    const created = await request(server)
      .post('/users')
      .set(as(admin.token))
      .send({
        username: `e2e_admin_created_${Date.now()}`,
        password: E2E_PASSWORD,
        roleCodes: ['ROLE_REVIEWER'],
      })
      .expect(201);
    createdUserIds.push(created.body.id);
    expect(created.body).toMatchObject({ roleCodes: ['ROLE_REVIEWER'] });
    expect(created.body).not.toHaveProperty('password');

    const page = await request(server)
      .get('/users/page')
      .query({ keyword: created.body.username, roleCode: 'ROLE_REVIEWER' })
      .set(as(admin.token))
      .expect(200);
    expect(page.body.total).toBe(1);

    await request(server)
      .put(`/users/${created.body.id}/roles`)
      .set(as(admin.token))
      .send({ roleCodes: ['ROLE_USER', 'ROLE_ADMIN'] })
      .expect(200);
    const roles = await request(server)
      .get(`/users/${created.body.id}/roles`)
      .set(as(admin.token))
      .expect(200);
    expect(roles.body.roleCodes.sort()).toEqual(['ROLE_ADMIN', 'ROLE_USER']);

    const roleList = await request(server)
      .get('/roles/list')
      .set(as(admin.token))
      .expect(200);
    expect(roleList.body.map((r: { roleCode: string }) => r.roleCode)).toEqual(
      expect.arrayContaining(['ROLE_ADMIN', 'ROLE_REVIEWER', 'ROLE_USER']),
    );
  });

  it('resolves permissions and lets admins manage them', async () => {
    const admin = await loginAsNewUser(['ROLE_ADMIN']);
    const normal = await loginAsNewUser();
    const server = app.getHttpServer();
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    // 普通用户经 ROLE_USER 预置绑定获得权限码；管理员追加全部操作权限
    const me = await request(server)
      .get('/auth/me')
      .set(as(normal.token))
      .expect(200);
    expect(me.body.permissions).toEqual(
      expect.arrayContaining(['document:list', 'document:create', 'search']),
    );
    expect(me.body.permissions).not.toContain('document:review');
    const adminMe = await request(server)
      .get('/auth/me')
      .set(as(admin.token))
      .expect(200);
    expect(adminMe.body.permissions).toEqual(
      expect.arrayContaining(['system:permission', 'system:team']),
    );

    await request(server)
      .get('/permissions/tree')
      .set(as(normal.token))
      .expect(403);
    const tree = await request(server)
      .get('/permissions/tree')
      .set(as(admin.token))
      .expect(200);
    const documentNode = tree.body.find(
      (n: { permissionCode: string }) => n.permissionCode === 'document',
    );
    expect(
      documentNode.children.map(
        (c: { permissionCode: string }) => c.permissionCode,
      ),
    ).toEqual(expect.arrayContaining(['document:list', 'document:review']));

    const reviewerPerms = await request(server)
      .get('/roles/2000000000000000002/permissions')
      .set(as(admin.token))
      .expect(200);
    // 审核员：搜索、文档列表、文档审核
    expect(reviewerPerms.body.permissionIds.sort()).toEqual([
      '4000000000000000003',
      '4000000000000000011',
      '4000000000000000015',
    ]);

    const code = `e2e:perm:${Date.now()}`;
    const created = await request(server)
      .post('/permissions')
      .set(as(admin.token))
      .send({
        permissionName: 'e2e 权限',
        permissionCode: code,
        permissionType: 2,
        parentId: '4000000000000000002',
      })
      .expect(201);
    const permissionId: string = created.body.id;
    createdPermissionIds.push(permissionId);
    await request(server)
      .post('/permissions')
      .set(as(admin.token))
      .send({ permissionName: '重复', permissionCode: code, permissionType: 2 })
      .expect(409);

    // 用户直接权限：替换后当前 token 下一次请求即生效（每次请求重读）
    await request(server)
      .put(`/users/${normal.userId}/permissions`)
      .set(as(admin.token))
      .send({ permissionIds: [permissionId] })
      .expect(200);
    const userPerms = await request(server)
      .get(`/users/${normal.userId}/permissions`)
      .set(as(admin.token))
      .expect(200);
    expect(userPerms.body.directPermissionIds).toEqual([permissionId]);
    expect(userPerms.body.permissionCodes).toContain(code);
    const meAfter = await request(server)
      .get('/auth/me')
      .set(as(normal.token))
      .expect(200);
    expect(meAfter.body.permissions).toContain(code);

    // 仍有绑定不能删；解绑后软删
    const bound = await request(server)
      .delete(`/permissions/${permissionId}`)
      .set(as(admin.token))
      .expect(400);
    expect(bound.body.message).toBe('权限仍有关联角色或用户，无法删除');
    await request(server)
      .put(`/users/${normal.userId}/permissions`)
      .set(as(admin.token))
      .send({ permissionIds: [] })
      .expect(200);
    await request(server)
      .delete(`/permissions/${permissionId}`)
      .set(as(admin.token))
      .expect(200);
    await request(server)
      .get(`/permissions/${permissionId}`)
      .set(as(admin.token))
      .expect(404);
  });

  it('lets admins manage teams and members', async () => {
    const admin = await loginAsNewUser(['ROLE_ADMIN']);
    const member = await loginAsNewUser();
    const server = app.getHttpServer();
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    // 团队树需登录且为管理员
    await request(server).get('/teams/tree').expect(401);
    await request(server).get('/teams/tree').set(as(member.token)).expect(403);
    const tree = await request(server)
      .get('/teams/tree')
      .set(as(admin.token))
      .expect(200);
    expect(tree.body.map((t: { teamCode: string }) => t.teamCode)).toContain(
      'TECH_CENTER',
    );

    await request(server).get('/teams/page').set(as(member.token)).expect(403);

    const created = await request(server)
      .post('/teams')
      .set(as(admin.token))
      .send({
        teamName: 'e2e 团队',
        teamCode: `E2E_${Date.now()}`,
        parentId: '8000000000000000001',
      })
      .expect(201);
    const teamId: string = created.body.id;
    createdTeamIds.push(teamId);

    await request(server)
      .post(`/teams/${teamId}/members`)
      .set(as(admin.token))
      .send([member.userId])
      .expect(201);
    const members = await request(server)
      .get(`/teams/${teamId}/members`)
      .set(as(admin.token))
      .expect(200);
    expect(members.body).toEqual([
      expect.objectContaining({
        userId: member.userId,
        memberRole: 'member',
        username: member.username,
      }),
    ]);
    const detail = await request(server)
      .get(`/teams/${teamId}`)
      .set(as(admin.token))
      .expect(200);
    expect(detail.body.memberCount).toBe(1);

    await request(server)
      .delete(`/teams/${teamId}/members`)
      .set(as(admin.token))
      .send([member.userId])
      .expect(200);
    await request(server)
      .delete(`/teams/${teamId}`)
      .set(as(admin.token))
      .expect(200);
    await request(server)
      .get(`/teams/${teamId}`)
      .set(as(admin.token))
      .expect(404);
  });

  it('searches documents and the graph with login and permission checks', async () => {
    const user = await loginAsNewUser();
    const server = app.getHttpServer();
    const as = { Authorization: `Bearer ${user.token}` };

    await request(server).post('/search').send({ keyword: 'x' }).expect(401);
    await request(server).post('/search').set(as).send({}).expect(400);
    // ROLE_USER 预置绑定了 search 权限码
    const found = await request(server)
      .post('/search')
      .set(as)
      .send({ keyword: '安装' })
      .expect(201);
    expect(found.body).toMatchObject({ total: 1, items: [{ title: '安装' }] });

    // 去掉 search 权限后 403（权限每次请求重读）
    const db = app.get(DataSource);
    await db.query(
      `INSERT INTO kh_user_role (id, user_id, role_id)
       SELECT $1, $2, id FROM kh_role WHERE role_code = 'ROLE_REVIEWER'`,
      [nextSnowflakeId(), user.userId],
    );
    await db.query(
      `DELETE FROM kh_user_role WHERE user_id = $1
       AND role_id = (SELECT id FROM kh_role WHERE role_code = 'ROLE_USER')`,
      [user.userId],
    );
    await request(server)
      .post('/documents')
      .set(as)
      .send({ title: 'x', content: 'x' })
      .expect(403);
    await request(server)
      .post('/search')
      .set(as)
      .send({ keyword: '安装' })
      .expect(201);

    await request(server).get('/graph/nodes').expect(401);
    const graph = await request(server)
      .get('/graph/search')
      .query({ keyword: '财务' })
      .set(as)
      .expect(200);
    expect(graph.body).toEqual([{ id: '财务', name: '财务' }]);
    await request(server).get('/graph/search').set(as).expect(400);
    await request(server).get('/graph/nodes').set(as).expect(200);
    await request(server).get('/graph/edges').set(as).expect(200);
  });

  it('retrieves chunks and answers with cited sources', async () => {
    const user = await loginAsNewUser();
    const server = app.getHttpServer();
    const as = { Authorization: `Bearer ${user.token}` };

    await request(server).post('/rag/search').send({ query: 'x' }).expect(401);
    await request(server).post('/rag/search').set(as).send({}).expect(400);
    await request(server)
      .post('/rag/search')
      .set(as)
      .send({ query: 'x', topK: 21 })
      .expect(400);

    // rerank 不可用时按 RRF 顺序截取 topK
    const found = await request(server)
      .post('/rag/search')
      .set(as)
      .send({ query: '金丝雀怎么做', topK: 1 })
      .expect(201);
    expect(found.body).toEqual([expect.objectContaining({ chunkId: 'c1' })]);

    const chat = await request(server)
      .post('/ai/chat')
      .set(as)
      .send({ content: '金丝雀怎么做' })
      .expect(201);
    expect(chat.body).toEqual({
      sessionId: expect.any(String),
      answer: '先做金丝雀 [1]。',
      sources: [
        {
          index: 1,
          documentId: '1',
          documentTitle: '灰度发布 SOP',
          heading: '金丝雀',
          excerpt: '先金丝雀 1%',
          score: 0.03,
        },
      ],
    });

    const empty = await request(server)
      .post('/ai/chat')
      .set(as)
      .send({ content: '无关' })
      .expect(201);
    expect(empty.body).toEqual({
      sessionId: expect.any(String),
      answer: '知识库里没有相关内容。',
      sources: [],
    });
    await request(server)
      .post('/ai/chat')
      .set(as)
      .send({ content: 'x', topK: 11 })
      .expect(400);
  });

  it('updates the profile, statistics and password of the current user', async () => {
    const me = await loginAsNewUser();
    const server = app.getHttpServer();
    const as = { Authorization: `Bearer ${me.token}` };

    const profile = await request(server)
      .put('/users/me')
      .set(as)
      .send({ realName: 'E2E 用户' })
      .expect(200);
    expect(profile.body.realName).toBe('E2E 用户');

    const stats = await request(server)
      .get('/users/me/stats')
      .set(as)
      .expect(200);
    expect(stats.body).toEqual({
      documentCount: 0,
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
    });

    await request(server)
      .put('/users/password/change')
      .set(as)
      .send({ oldPassword: 'wrong-password', newPassword: 'new-password-1' })
      .expect(400);
    await request(server)
      .put('/users/password/change')
      .set(as)
      .send({ oldPassword: E2E_PASSWORD, newPassword: 'new-password-1' })
      .expect(200);
    await request(server)
      .post('/auth/login')
      .send({ username: me.username, password: 'new-password-1' })
      .expect(201);
  });

  it('resets a forgotten password with an emailed code', async () => {
    const email = `e2e_${Date.now()}@example.com`;
    const user = await loginAsNewUser([], email);
    const server = app.getHttpServer();

    await request(server)
      .post('/auth/password/reset/send-code')
      .send({ email: `missing_${email}` })
      .expect(404);
    await request(server)
      .post('/auth/password/reset/send-code')
      .send({ email })
      .expect(201);
    // 60 秒内重复发送被拦截
    await request(server)
      .post('/auth/password/reset/send-code')
      .send({ email })
      .expect(400);

    const mail = sentMails.find(
      (m) => m.to === email && m.text.includes('验证码'),
    );
    const code = /验证码是：(\d{6})/.exec(mail?.text ?? '')?.[1];
    expect(code).toMatch(/^\d{6}$/);

    await request(server)
      .post('/auth/password/reset')
      .send({ email, code: '000000', newPassword: 'reset-password-1' })
      .expect(400);
    await request(server)
      .post('/auth/password/reset')
      .send({ email, code, newPassword: 'reset-password-1' })
      .expect(201);
    await request(server)
      .post('/auth/login')
      .send({ username: user.username, password: 'reset-password-1' })
      .expect(201);
  });

  it('invalidates the reset code after 3 wrong attempts', async () => {
    const email = `e2e_lock_${Date.now()}@example.com`;
    await loginAsNewUser([], email);
    const server = app.getHttpServer();

    await request(server)
      .post('/auth/password/reset/send-code')
      .send({ email })
      .expect(201);
    const mail = sentMails.find(
      (m) => m.to === email && m.text.includes('验证码'),
    );
    const code = /验证码是：(\d{6})/.exec(mail?.text ?? '')?.[1];
    const wrong = code === '000000' ? '111111' : '000000';

    for (const expected of [
      '验证码错误或已过期',
      '验证码错误或已过期',
      '验证码错误次数过多，请重新获取',
    ]) {
      const res = await request(server)
        .post('/auth/password/reset')
        .send({ email, code: wrong, newPassword: 'reset-password-1' })
        .expect(400);
      expect(res.body.message).toBe(expected);
    }

    // 正确的码也已作废
    await request(server)
      .post('/auth/password/reset')
      .send({ email, code, newPassword: 'reset-password-1' })
      .expect(400);
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
    if (createdTeamIds.length) {
      await dataSource.query(
        'DELETE FROM kh_team_member WHERE team_id = ANY($1::bigint[])',
        [createdTeamIds],
      );
      await dataSource.query(
        'DELETE FROM kh_team WHERE id = ANY($1::bigint[])',
        [createdTeamIds],
      );
    }
    if (createdUserIds.length) {
      await dataSource.query(
        'DELETE FROM kh_team_member WHERE user_id = ANY($1::bigint[])',
        [createdUserIds],
      );
      await dataSource.query(
        'DELETE FROM kh_user_permission WHERE user_id = ANY($1::bigint[])',
        [createdUserIds],
      );
      await dataSource.query(
        'DELETE FROM kh_user_role WHERE user_id = ANY($1::bigint[])',
        [createdUserIds],
      );
      await dataSource.query(
        'DELETE FROM kh_user WHERE id = ANY($1::bigint[])',
        [createdUserIds],
      );
    }
    if (createdPermissionIds.length) {
      await dataSource.query(
        'DELETE FROM kh_role_permission WHERE permission_id = ANY($1::bigint[])',
        [createdPermissionIds],
      );
      await dataSource.query(
        'DELETE FROM kh_user_permission WHERE permission_id = ANY($1::bigint[])',
        [createdPermissionIds],
      );
      await dataSource.query(
        'DELETE FROM kh_permission WHERE id = ANY($1::bigint[])',
        [createdPermissionIds],
      );
    }
    createdDocumentIds = [];
    createdUserIds = [];
    createdPermissionIds = [];
    createdTeamIds = [];
    await app.close();
  });

  /** 注册一个唯一用户名的账号（可额外授予角色）并登录 */
  async function loginAsNewUser(extraRoles: string[] = [], email?: string) {
    const username = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: E2E_PASSWORD, email })
      .expect(201);
    const userId: string = registered.body.userId;
    createdUserIds.push(userId);

    // REQUIRE_EMAIL_VERIFICATION=true 时带邮箱注册须先点激活链接才能登录
    if (registered.body.emailVerificationRequired) {
      const mail = sentMails.find(
        (m) => m.to === email && m.text.includes('verify-email'),
      );
      const token = /verify-email\?token=(\S+)/.exec(mail?.text ?? '')?.[1];
      expect(token).toBeDefined();
      await request(app.getHttpServer())
        .get('/auth/verify-email')
        .query({ token })
        .expect(200);
    }

    for (const roleCode of extraRoles) {
      await app.get(DataSource).query(
        `INSERT INTO kh_user_role (id, user_id, role_id)
         SELECT $1, $2, id FROM kh_role WHERE role_code = $3`,
        [nextSnowflakeId(), userId, roleCode],
      );
    }

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: E2E_PASSWORD })
      .expect(201);
    return { token: login.body.accessToken as string, userId, username };
  }
});
