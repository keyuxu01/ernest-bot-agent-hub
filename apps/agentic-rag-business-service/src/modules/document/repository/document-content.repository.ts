import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DocumentContent,
  DocumentContentDocument,
} from '../schemas/document-content.schema';
import { CreateDocumentContentInput } from '../type/create-document-content.input';
import { UpdateDocumentContentInput } from '../type/update-document-content.input';

/**
 * MongoDB `document_content` 数据访问
 *
 * 职责：封装正文集合的读写、版本递增与软删。
 * `_id`（ObjectId）会作为 Postgres `kh_document.content_id` 回写；
 * 双写顺序与失败回滚由 DocumentService 编排。
 */
@Injectable()
export class DocumentContentRepository {
  constructor(
    /** Mongoose Model，对应集合 `document_content` */
    @InjectModel(DocumentContent.name)
    private readonly contentModel: Model<DocumentContentDocument>,
  ) {}

  /**
   * 写入正文文档并返回含 `_id` 的完整文档
   * 调用方需把 `String(_id)` 写入 Postgres `content_id`
   */
  async create(
    input: CreateDocumentContentInput,
  ): Promise<DocumentContentDocument> {
    return this.contentModel.create({
      documentId: input.documentId,
      content: input.content,
      contentLength: input.contentLength,
      contentSummary: input.contentSummary,
      version: input.version ?? 1,
      deleted: input.deleted ?? false,
    });
  }

  /**
   * 按 Mongo `_id`（即 PG.content_id）读取未软删正文
   * 仅 select `content`，详情接口附带正文时使用
   */
  async findActiveContentById(
    contentId: string,
  ): Promise<{ content: string } | null> {
    return this.contentModel
      .findOne({ _id: contentId, deleted: false })
      .select({ content: 1 })
      .lean();
  }

  /**
   * 更新正文并递增 version
   * @returns matchedCount：0 表示正文不存在或已软删，由 Service 转业务错误
   */
  async updateContent(
    contentId: string,
    input: UpdateDocumentContentInput,
  ): Promise<{ matchedCount: number }> {
    const result = await this.contentModel.updateOne(
      { _id: contentId, deleted: false },
      {
        $set: {
          content: input.content,
          contentLength: input.contentLength,
          contentSummary: input.contentSummary,
        },
        $inc: { version: 1 }, // 版本号 +1
      },
    );
    return { matchedCount: result.matchedCount };
  }

  /**
   * 仅同步预览摘要（未改正文但改了 PG.summary 时调用）
   */
  async updateContentSummary(
    contentId: string,
    contentSummary: string,
  ): Promise<void> {
    await this.contentModel.updateOne(
      { _id: contentId, deleted: false },
      { $set: { contentSummary } },
    );
  }

  /**
   * 软删除正文（与 PG 侧 `deleted = true` 配套）
   * 不物理删，便于审计与恢复
   */
  async softDelete(contentId: string): Promise<void> {
    await this.contentModel.updateOne(
      { _id: contentId },
      { $set: { deleted: true } },
    );
  }

  /**
   * 创建失败回滚：物理删除刚写入的正文
   * 仅用于「Mongo 已写、Postgres 写入失败」的补偿路径
   */
  async deleteById(contentId: string): Promise<void> {
    await this.contentModel.deleteOne({ _id: contentId });
  }
}
