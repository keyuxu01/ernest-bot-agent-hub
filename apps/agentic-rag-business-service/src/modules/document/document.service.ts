import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import type { AuthUser } from '../user/type/user.types';
import { REVIEW_CANCELLED_ON_DELETE_COMMENT } from './constants/document-review.constants';
import { DocumentIndexSyncService } from './document-index-sync.service';
import { DocumentReviewService } from './document-review.service';
import { DocumentContentRepository } from './repository/document-content.repository';
import { DocumentReviewRepository } from './repository/document-review.repository';
import { DocumentRepository } from './repository/document.repository';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentEntity, DocumentStatus } from './entities/document.entity';
import { buildContentSummary } from './helpers/build-content-summary';
import { countWords } from './helpers/count-words';
import { documentLifecycleError } from './helpers/document-lifecycle-error';
import {
  accessFromUser,
  canReadDocument,
  canWriteDocument,
} from './helpers/document-access';
import {
  canArchiveFrom,
  canPublishFrom,
  canSaveAsDraftFrom,
} from './helpers/document-status-rules';

/**
 * 文档领域服务（双库协作）
 *
 * | 存储 | 表 / 集合 | 存什么 |
 * | ---- | --------- | ------ |
 * | PostgreSQL | `kh_document` | 标题、状态、分类、统计、权限等元数据 |
 * | MongoDB | `document_content` | Markdown 正文、长度、预览、版本 |
 *
 * 关联键：
 * - `kh_document.id`（雪花 string）↔ `document_content.documentId`
 * - `kh_document.content_id`（ObjectId string）↔ `document_content._id`
 *
 * 设计说明：
 * - 列表接口只查 Postgres，避免 N 次 Mongo 拉正文。
 * - 创建时先写 Mongo 再写 Postgres（需要 `content_id`）；PG 失败则删 Mongo，非分布式事务。
 * - 删除为两侧软删（`deleted`），便于审计与恢复。
 * - 持久化细节下沉到 DocumentRepository / DocumentContentRepository。
 *
 * 状态与索引（规则见 helpers/document-status-rules.ts）：
 * - 只有进入 / 离开 Published 才投递索引命令（DocumentIndexSyncService）。
 * - 状态变更走专用接口（publish / archive / save-draft / 审核）；PATCH 只兼容 Published → Draft。
 * - 开启审核（DOCUMENT_REQUIRE_APPROVAL）时，publish 进入待审，已发布文档须先存草稿才能改标题 / 正文。
 */
@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly contentRepo: DocumentContentRepository,
    private readonly reviewRepo: DocumentReviewRepository,
    private readonly reviewService: DocumentReviewService,
    private readonly indexSync: DocumentIndexSyncService,
  ) {}

  /**
   * @description 创建文档。流程：生成雪花 ID → 写 Mongo 正文（拿 ObjectId）→ 写 Postgres 元数据；
   * Postgres 写入失败时删除刚写入的 Mongo 正文，避免脏数据。
   * 仅允许草稿或（免审时）已发布；创建即发布会投递索引（只投文档 ID）
   * @param dto CreateDocumentDto，标题、正文必填；摘要、分类、团队、封面、标签、状态、备注、是否公开可选（不含作者 / 创建人）
   * @param actor AuthUser，当前登录用户：authorId / createBy / updateBy 都取它的 userId
   * @returns Promise<DocumentEntity & { content: string }>，新建的文档元数据加正文
   * @throws HttpException DOCUMENT_CREATE_STATUS_INVALID（状态不是草稿 / 已发布）、DOCUMENT_APPROVAL_REQUIRED（开启审核时直接创建已发布）
   */
  async create(dto: CreateDocumentDto, actor: AuthUser) {
    const status = dto.status ?? DocumentStatus.Draft;
    if (
      status !== DocumentStatus.Draft &&
      status !== DocumentStatus.Published
    ) {
      throw documentLifecycleError(
        'DOCUMENT_CREATE_STATUS_INVALID',
        '创建文档仅允许草稿或已发布状态',
      );
    }
    if (
      status === DocumentStatus.Published &&
      this.reviewService.isApprovalRequired()
    ) {
      throw documentLifecycleError(
        'DOCUMENT_APPROVAL_REQUIRED',
        '开启审核时请先创建草稿，再提交发布',
      );
    }

    // 全局唯一业务主键（PG id）；Mongo 侧用 documentId 指向它
    const id = nextSnowflakeId();
    const wordCount = countWords(dto.content);
    // PG.summary 可空；Mongo.contentSummary 始终有预览（未传则从正文截取）
    const contentSummary = dto.summary ?? buildContentSummary(dto.content);

    // ① Mongo：生成 _id，供 PG.content_id 引用
    const contentDoc = await this.contentRepo.create({
      documentId: id,
      content: dto.content,
      contentLength: dto.content.length,
      contentSummary,
      version: 1,
      deleted: false,
    });
    // ObjectId 转字符串，存入 Postgres content_id
    const contentId = String(contentDoc._id);

    let saved: DocumentEntity;
    try {
      // ② Postgres：写入元数据行
      saved = await this.documentRepo.create({
        id,
        title: dto.title,
        contentId,
        summary: dto.summary,
        categoryId: dto.categoryId,
        teamId: dto.teamId,
        authorId: actor.userId,
        coverImage: dto.coverImage,
        tags: dto.tags,
        status,
        remark: dto.remark,
        isPublic: dto.isPublic ?? false,
        wordCount,
        // 创建即发布时，记录发布时间
        publishTime: status === DocumentStatus.Published ? new Date() : null,
        createBy: actor.userId,
        updateBy: actor.userId,
        deleted: false,
      });
    } catch (error) {
      // Postgres 失败：物理删除刚写入的 Mongo 正文
      await this.contentRepo.deleteById(contentId);
      throw error;
    }

    // ③ 创建即发布（只可能是免审）：投递索引；失败不影响创建结果
    if (status === DocumentStatus.Published) {
      await this.indexSync.publish(saved);
    }
    return { ...saved, content: dto.content };
  }

  /**
   * @description 分页查询当前用户可见文档：本人文档，以及已发布的公开或本人团队文档；管理员/审核员不限制
   * @param query QueryDocumentDto，分页与筛选条件
   * @param user AuthUser，当前登录用户
   * @returns Promise，当前页可见文档元数据与总数
   */
  async findAll(query: QueryDocumentDto, user: AuthUser) {
    return this.documentRepo.findPage(query, accessFromUser(user));
  }

  /**
   * @description 查询文档详情；传入用户时按作者、公开状态和团队校验可见性
   * @param id string，文档 ID
   * @param withContent boolean，是否附带 Mongo 正文，默认 true
   * @param user AuthUser | undefined，传入时校验文档可见性；内部管线调用可不传
   * @returns Promise，文档元数据或元数据加正文
   * @throws NotFoundException 文档不存在；ForbiddenException 当前用户不可读
   */
  async findOne(id: string, withContent = true, user?: AuthUser) {
    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    if (user && !canReadDocument(doc, accessFromUser(user))) {
      throw new ForbiddenException('无权查看该文档');
    }

    if (!withContent) {
      return doc;
    }

    // contentId 存的是 Mongo ObjectId 的 hex 字符串
    const contentDoc = await this.contentRepo.findActiveContentById(
      doc.contentId,
    );
    return {
      ...doc,
      content: contentDoc?.content ?? '',
    };
  }

  /**
   * 更新文档
   * - 有 content：同步更新 Mongo 正文，并递增 version
   * - 仅改 summary：同步更新 Mongo contentSummary
   * - 其余字段只更新 Postgres 元数据
   * - status 只允许 Published → Draft（等价于 save-draft，会清索引）；其余走专用接口
   * - 待审核期间不可改标题 / 正文；开启审核时已发布文档须先存草稿再改
   * - 免审时已发布文档改标题 / 正文会重建索引；其余元数据变更不重建（ADR-0021 既有限制）
   * @description 更新文档（PATCH 语义：只改传了的字段），更新人一律取登录用户
   * @param id string，文档 ID
   * @param dto UpdateDocumentDto，要修改的字段，都可选（不含作者 / 更新人）
   * @param actor AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<DocumentEntity & { content: string }>，更新后的元数据加正文
   * @throws NotFoundException 文档不存在；HttpException 状态变更不允许、审核中改正文、已发布需先存草稿
   */
  async update(id: string, dto: UpdateDocumentDto, actor: AuthUser) {
    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    this.assertWritable(doc, actor);

    // —— 状态与编辑权限：先校验，再写任何一侧存储 ——
    const oldStatus = doc.status;
    const oldIsPublic = doc.isPublic;
    const oldTeamId = doc.teamId ?? null;
    let nextStatus = doc.status;
    if (dto.status !== undefined && dto.status !== doc.status) {
      if (
        dto.status === DocumentStatus.Draft &&
        doc.status === DocumentStatus.Published
      ) {
        nextStatus = DocumentStatus.Draft;
      } else {
        throw documentLifecycleError(
          'DOCUMENT_STATUS_CHANGE_NOT_ALLOWED',
          '请使用 publish / archive / save-draft / 审核接口变更文档状态',
        );
      }
    }

    const editsBody = dto.content !== undefined || dto.title !== undefined;
    if (editsBody && doc.status === DocumentStatus.PendingReview) {
      throw documentLifecycleError(
        'DOCUMENT_UNDER_REVIEW',
        '审核中的文档不可修改标题或正文',
      );
    }
    if (
      editsBody &&
      nextStatus === DocumentStatus.Published &&
      this.reviewService.isApprovalRequired()
    ) {
      // 改稿必须重新审核：先存草稿（清索引），改完再提交发布
      throw documentLifecycleError(
        'DOCUMENT_PUBLISHED_EDIT_REQUIRES_DRAFT',
        '已发布文档请先存为草稿，修改后再提交发布',
      );
    }

    // —— Mongo：正文 / 预览（与 PG 元数据分开更新）——
    if (dto.content !== undefined) {
      const contentSummary = dto.summary ?? buildContentSummary(dto.content);
      const result = await this.contentRepo.updateContent(doc.contentId, {
        content: dto.content,
        contentLength: dto.content.length,
        contentSummary,
      });
      if (result.matchedCount === 0) {
        throw new BadRequestException(
          `Document content ${doc.contentId} not found`,
        );
      }
      doc.wordCount = countWords(dto.content);
    } else if (dto.summary !== undefined) {
      // 未改正文但改了 summary：只同步 Mongo.contentSummary（PG.summary 见下方）
      await this.contentRepo.updateContentSummary(doc.contentId, dto.summary);
    }

    // —— Postgres：PATCH 语义，undefined 表示「不修改该字段」——
    if (dto.title !== undefined) doc.title = dto.title;
    if (dto.summary !== undefined) doc.summary = dto.summary;
    if (dto.categoryId !== undefined) doc.categoryId = dto.categoryId;
    if (dto.teamId !== undefined) doc.teamId = dto.teamId;
    if (dto.coverImage !== undefined) doc.coverImage = dto.coverImage;
    if (dto.tags !== undefined) doc.tags = dto.tags;
    if (dto.remark !== undefined) doc.remark = dto.remark;
    if (dto.isPublic !== undefined) doc.isPublic = dto.isPublic;
    doc.updateBy = actor.userId;
    doc.status = nextStatus;
    const saved = await this.documentRepo.save(doc);
    const content = await this.resolveContent(doc.contentId, dto.content);

    const visibilityChanged =
      saved.isPublic !== oldIsPublic || (saved.teamId ?? null) !== oldTeamId;

    // —— 索引：离开 Published 清理；改标题/正文重建；只改公开/团队时直接刷新可见性字段 ——
    if (
      oldStatus === DocumentStatus.Published &&
      nextStatus !== DocumentStatus.Published
    ) {
      await this.indexSync.unpublish(id);
    } else if (nextStatus === DocumentStatus.Published && editsBody) {
      await this.indexSync.publish(saved);
    } else if (nextStatus === DocumentStatus.Published && visibilityChanged) {
      await this.indexSync.updateVisibility(saved);
    }

    return { ...saved, content };
  }

  /**
   * 发布文档
   * - 开启审核：Draft / Published / Archived → PendingReview（不建索引；来自 Published 会清旧索引）
   * - 免审：Draft / Published / Archived → Published，刷新 publishTime 并投递索引
   * - 已发布再次发布 = 重建索引（需审时则重新走审核）
   *
   * 异步消费侧见 DocumentPipelineConsumer → PipelineOrchestrator：
   * RAG：分块 → 嵌入 → ES(kh_chunk)；Search：PG + Mongo 全文 → ES(kh_document)；KG：抽取 → Neo4j
   * @description 发布文档：开启审核时提交审核，免审时直接发布并投递索引
   * @param id string，文档 ID
   * @param actor AuthUser，当前登录用户，写入 updateBy（提交审核时同样写入）
   * @returns Promise<DocumentEntity & { content: string }>，发布后（或进入待审后）的文档加正文
   * @throws NotFoundException 文档不存在；HttpException DOCUMENT_UNDER_REVIEW、DOCUMENT_TRANSITION_NOT_ALLOWED
   */
  async publish(id: string, actor: AuthUser) {
    this.logger.log(`发布文档：documentId=${id}`);

    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    this.assertWritable(doc, actor);
    if (doc.status === DocumentStatus.PendingReview) {
      throw documentLifecycleError(
        'DOCUMENT_UNDER_REVIEW',
        '文档审核中，请等待审核结果',
      );
    }
    if (!canPublishFrom(doc.status)) {
      throw documentLifecycleError(
        'DOCUMENT_TRANSITION_NOT_ALLOWED',
        '当前文档状态不允许发布',
      );
    }

    if (this.reviewService.isApprovalRequired()) {
      // 归档文档重新上架同样走审核，不能绕过
      const submitted = await this.reviewService.submit(id, actor);
      const content = await this.resolveContent(submitted.contentId);
      return { ...submitted, content };
    }

    doc.status = DocumentStatus.Published;
    doc.publishTime = new Date();
    doc.updateBy = actor.userId;
    const saved = await this.documentRepo.save(doc);
    const content = await this.resolveContent(doc.contentId);
    await this.indexSync.publish(saved);

    this.logger.log(`文档发布成功：documentId=${id}`);
    return { ...saved, content };
  }

  /**
   * @description 归档：Published → Archived，保留正文、清索引
   * @param id string，文档 ID
   * @param actor AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<DocumentEntity>，归档后的文档
   * @throws NotFoundException 文档不存在；HttpException 不是已发布状态
   */
  async archive(id: string, actor: AuthUser) {
    const saved = await this.moveOutOfPublished(
      id,
      actor,
      DocumentStatus.Archived,
      canArchiveFrom,
      '只有已发布文档可以归档',
    );
    this.logger.log(`文档已归档：documentId=${id}`);
    return saved;
  }

  /**
   * @description 存为草稿（下架编辑）：Published → Draft，清索引后可改内容再提交发布
   * @param id string，文档 ID
   * @param actor AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<DocumentEntity>，改为草稿后的文档
   * @throws NotFoundException 文档不存在；HttpException 不是已发布状态
   */
  async saveAsDraft(id: string, actor: AuthUser) {
    const saved = await this.moveOutOfPublished(
      id,
      actor,
      DocumentStatus.Draft,
      canSaveAsDraftFrom,
      '只有已发布文档可以存为草稿',
    );
    this.logger.log(`文档已存为草稿：documentId=${id}`);
    return saved;
  }

  /**
   * 软删除文档
   * Postgres、Mongo 两侧都将 deleted 置为 true（不物理删正文）；
   * PG 软删与撤销待审任务同事务，避免已删文档的任务留在待办。
   * 无论原状态都投递清理：幂等，也能补上此前失败的清理。
   * @description 软删除文档并投递索引清理
   * @param id string，文档 ID
   * @param actor AuthUser，当前登录用户，写入 updateBy（记录谁删的）
   * @returns Promise<{ id: string; deleted: true }>，被删文档 ID
   * @throws NotFoundException 文档不存在或已删除
   */
  async remove(id: string, actor: AuthUser) {
    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    this.assertWritable(doc, actor);

    doc.deleted = true;
    doc.updateBy = actor.userId;
    await this.reviewRepo.saveDeletedDocument(
      doc,
      REVIEW_CANCELLED_ON_DELETE_COMMENT,
    );
    // 与 PG 无跨库事务；若 Mongo 更新失败需靠补偿任务或重试（当前顺序：先 PG 后 Mongo）
    await this.contentRepo.softDelete(doc.contentId);
    // 两侧软删完成后异步清理；投递失败不回滚，当前没有自动补偿保证。
    await this.indexSync.unpublish(id);
    return { id, deleted: true };
  }

  /**
   * @description 已发布 → 目标状态并清索引（归档 / 存草稿共用）
   * @param id string，文档 ID
   * @param actor AuthUser，当前登录用户，写入 updateBy
   * @param target DocumentStatus，目标状态（Archived / Draft）
   * @param allowed (status: DocumentStatus) => boolean，判断当前状态能否转出的规则函数
   * @param message string，不允许转出时的错误提示
   * @returns Promise<DocumentEntity>，状态变更后的文档
   * @throws NotFoundException 文档不存在；HttpException DOCUMENT_TRANSITION_NOT_ALLOWED
   */
  private async moveOutOfPublished(
    id: string,
    actor: AuthUser,
    target: DocumentStatus,
    allowed: (status: DocumentStatus) => boolean,
    message: string,
  ): Promise<DocumentEntity> {
    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    this.assertWritable(doc, actor);
    if (!allowed(doc.status)) {
      throw documentLifecycleError('DOCUMENT_TRANSITION_NOT_ALLOWED', message);
    }

    doc.status = target;
    doc.updateBy = actor.userId;
    const saved = await this.documentRepo.save(doc);
    await this.indexSync.unpublish(id);
    return saved;
  }

  /**
   * @description 校验当前用户能否修改文档；管理员可改全部，其他角色只能改本人文档
   * @param document DocumentEntity，待修改文档
   * @param actor AuthUser，当前登录用户
   * @returns void，允许修改时正常返回
   * @throws ForbiddenException 当前用户不是管理员且不是文档作者
   */
  private assertWritable(document: DocumentEntity, actor: AuthUser): void {
    if (!canWriteDocument(document, actor)) {
      throw new ForbiddenException('无权修改该文档');
    }
  }

  /** 本次已带新正文则直接用；否则按 contentId 读 Mongo */
  private async resolveContent(
    contentId: string,
    content?: string,
  ): Promise<string> {
    if (content !== undefined) {
      return content;
    }
    const contentDoc = await this.contentRepo.findActiveContentById(contentId);
    return contentDoc?.content ?? '';
  }
}
