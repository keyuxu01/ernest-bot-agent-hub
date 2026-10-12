import { buildSearchIndexData } from './helpers/build-search-index-data';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import { DocumentPipelinePublisher } from '../../infrastructure/rabbitmq/document-pipeline.publisher';
import { DocumentContentRepository } from './repository/document-content.repository';
import { DocumentRepository } from './repository/document.repository';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentStatus } from './entities/document.entity';
import { buildContentSummary } from './helpers/build-content-summary';
import { countWords } from './helpers/count-words';

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
 */
@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly contentRepo: DocumentContentRepository,
    private readonly pipelinePublisher: DocumentPipelinePublisher,
  ) {}

  /**
   * 创建文档
   * 流程：生成雪花 ID → 写 Mongo 正文（拿 ObjectId）→ 写 Postgres 元数据
   * 若 Postgres 写入失败，回滚删除已写入的 Mongo 正文，避免脏数据
   */
  async create(dto: CreateDocumentDto) {
    // 全局唯一业务主键（PG id）；Mongo 侧用 documentId 指向它
    const id = nextSnowflakeId();
    const wordCount = countWords(dto.content);
    const status = dto.status ?? DocumentStatus.Draft;
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

    try {
      // ② Postgres：写入元数据行
      const saved = await this.documentRepo.create({
        id,
        title: dto.title,
        contentId,
        summary: dto.summary,
        categoryId: dto.categoryId,
        teamId: dto.teamId,
        authorId: dto.authorId,
        coverImage: dto.coverImage,
        tags: dto.tags,
        status,
        remark: dto.remark,
        isPublic: dto.isPublic ?? false,
        wordCount,
        // 创建即发布时，记录发布时间
        publishTime: status === DocumentStatus.Published ? new Date() : null,
        createBy: dto.createBy,
        updateBy: dto.createBy,
        deleted: false,
      });
      return { ...saved, content: dto.content };
    } catch (error) {
      // Postgres 失败：物理删除刚写入的 Mongo 正文
      await this.contentRepo.deleteById(contentId);
      throw error;
    }
  }

  /**
   * 分页查询文档列表（只返回 Postgres 元数据，不含正文）
   * 支持按标题模糊、分类 / 团队 / 作者 / 状态筛选
   */
  async findAll(query: QueryDocumentDto) {
    return this.documentRepo.findPage(query);
  }

  /**
   * 查询文档详情
   * @param withContent 是否附带 Mongo 正文，默认 true
   */
  async findOne(id: string, withContent = true) {
    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
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
   * - 首次变为「已发布」时写入 publishTime
   */
  async update(id: string, dto: UpdateDocumentDto) {
    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
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
    if (dto.authorId !== undefined) doc.authorId = dto.authorId;
    if (dto.coverImage !== undefined) doc.coverImage = dto.coverImage;
    if (dto.tags !== undefined) doc.tags = dto.tags;
    if (dto.remark !== undefined) doc.remark = dto.remark;
    if (dto.isPublic !== undefined) doc.isPublic = dto.isPublic;
    if (dto.updateBy !== undefined) doc.updateBy = dto.updateBy;

    // 状态从非发布 → 发布时，记录发布时间
    if (dto.status !== undefined) {
      if (
        dto.status === DocumentStatus.Published &&
        doc.status !== DocumentStatus.Published
      ) {
        doc.publishTime = new Date();
      }
      doc.status = dto.status;
    }

    const saved = await this.documentRepo.save(doc);

    // 本次已带新正文则直接返回；否则再查一次 Mongo
    if (dto.content !== undefined) {
      return { ...saved, content: dto.content };
    }

    const contentDoc = await this.contentRepo.findActiveContentById(
      doc.contentId,
    );
    return { ...saved, content: contentDoc?.content ?? '' };
  }

  /**
   * 直接发布文档（不做审核）
   *
   * 流程：
   * 1. 校验文档存在且状态为草稿 / 已发布
   * 2. 写库：status=Published，刷新 publishTime
   * 3. 投递 RabbitMQ（RAG 向量化 + Search 文档快照）；失败只打日志，不回滚「已发布」
   *
   * 异步消费侧见 DocumentPipelineConsumer → PipelineOrchestrator：
   * RAG：分块 → 嵌入 → ES(kh_chunk)；Search：正文前缀快照 → ES(kh_document)
   */
  async publish(id: string) {
    this.logger.log(`发布文档：documentId=${id}`);

    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    if (
      doc.status !== DocumentStatus.Draft &&
      doc.status !== DocumentStatus.Published
    ) {
      throw new BadRequestException('当前文档状态不允许发布');
    }

    doc.status = DocumentStatus.Published;
    doc.publishTime = new Date();
    const saved = await this.documentRepo.save(doc);

    const contentDoc = await this.contentRepo.findActiveContentById(
      doc.contentId,
    );

    try {
      await this.pipelinePublisher.afterPublish(
        buildSearchIndexData(saved, contentDoc?.content),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `发布后管线投递失败（不影响发布）：documentId=${id}, error=${message}`,
      );
    }

    this.logger.log(`文档发布成功：documentId=${id}`);
    return { ...saved, content: contentDoc?.content ?? '' };
  }

  /**
   * 软删除文档
   * Postgres、Mongo 两侧都将 deleted 置为 true（不物理删正文）
   */
  async remove(id: string) {
    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    doc.deleted = true;
    await this.documentRepo.save(doc);
    // 与 PG 无跨库事务；若 Mongo 更新失败需靠补偿任务或重试（当前顺序：先 PG 后 Mongo）
    await this.contentRepo.softDelete(doc.contentId);
    // 两侧软删完成后异步清理；投递失败不回滚，当前没有自动补偿保证。
    try {
      await this.pipelinePublisher.afterUnpublish(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `删除后索引清理投递失败：documentId=${id}, error=${message}`,
      );
    }
    return { id, deleted: true };
  }
}
