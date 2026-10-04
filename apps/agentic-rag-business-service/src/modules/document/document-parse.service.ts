import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RustfsService } from '../../infrastructure/rustfs/rustfs.service';
import {
  DOCUMENT_IMAGE_PREFIX,
  DOCUMENT_SOURCE_PREFIX,
  UNTITLED_DOCUMENT_TITLE,
} from './constants/document-upload.constants';
import { DocumentService } from './document.service';
import { UploadParseDocumentDto } from './dto/upload-parse-document.dto';
import { DocumentStatus } from './entities/document.entity';
import { buildContentSummary } from './helpers/build-content-summary';
import { detectDocumentFileType } from './helpers/detect-document-file-type';
import { replaceImageReferences } from './helpers/markdown-image-references';
import { convertDocument } from './helpers/convert-document';
import {
  uploadedDocumentFileSchema,
  uploadParseDocumentResultSchema,
} from './schemas/document-upload.zod';
import type { ConvertedDocument } from './type/document-convert.types';
import type {
  DocumentUploadErrorCode,
  UploadParseDocumentResult,
} from './type/document-upload.types';

/**
 * 文档上传解析（同步 MVP）
 *
 * 流程：校验文件 → 按格式转 Markdown（抽出图片）→ 原文件与图片写 RustFS 并改写链接 →
 * `DocumentService.create` 写 Mongo 正文 + PG 元数据（草稿）→ 返回摘要。
 *
 * - txt / md 直接按 UTF-8 读取；pdf / docx / xlsx / pptx 在本进程内解析。
 * - 先解析再写存储：解析失败或结果为空时不产生 RustFS 对象。
 * - 原文件信息只在响应中返回，不随文档落库；文档与原文件的关联后续单独处理。
 * - 落库失败会留下 RustFS 孤儿对象（尚无清理任务）。
 */
@Injectable()
class DocumentParseService {
  private readonly logger = new Logger(DocumentParseService.name);

  constructor(
    private readonly documentService: DocumentService,
    private readonly rustfs: RustfsService,
  ) {}

  /**
   * @param uploaded `@UploadedFile()` 的原始值；未上传 `file` 字段时为 undefined
   * @throws HttpException 响应体 `{ statusCode, code, message }`，code 见 `documentUploadErrorCodeSchema`
   */
  async uploadAndParse(
    uploaded: unknown,
    dto: UploadParseDocumentDto,
  ): Promise<UploadParseDocumentResult> {
    const parsedFile = uploadedDocumentFileSchema.safeParse(uploaded);
    if (!parsedFile.success) {
      throw uploadError(
        HttpStatus.BAD_REQUEST,
        'DOCUMENT_FILE_REQUIRED',
        'Multipart field "file" is required',
      );
    }
    const file = parsedFile.data;

    const fileType = detectDocumentFileType(file.originalname);
    if (!fileType) {
      throw uploadError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'DOCUMENT_FILE_TYPE_UNSUPPORTED',
        'Supported file types: pdf, docx, xlsx, pptx, txt, md',
      );
    }

    let converted: ConvertedDocument;
    try {
      converted = await convertDocument(fileType, file.buffer);
    } catch (err) {
      this.logger.error(
        `文件解析失败: file=${file.originalname}, ${err instanceof Error ? err.message : err}`,
      );
      throw uploadError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'DOCUMENT_PARSE_FAILED',
        'Document parsing failed',
      );
    }

    if (!converted.markdown.trim()) {
      this.logger.warn(`解析结果为空: file=${file.originalname}`);
      throw uploadError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'DOCUMENT_PARSE_EMPTY',
        'Parsed document has no content',
      );
    }

    const mimeType = file.mimetype || 'application/octet-stream';
    const sourceUrl = await this.rustfs.uploadBytes(file.buffer, {
      fileName: file.originalname,
      contentType: mimeType,
      prefix: DOCUMENT_SOURCE_PREFIX,
    });

    const { content, imageCount } = await this.storeImages(converted);

    const created = await this.documentService.create({
      title: dto.title?.trim() || titleFromFileName(file.originalname),
      content,
      status: DocumentStatus.Draft,
      categoryId: dto.categoryId,
      teamId: dto.teamId,
      authorId: dto.authorId,
      tags: dto.tags,
      remark: dto.remark,
      createBy: dto.createBy,
    });

    // 出参边界校验：字段与 zod 推断类型对齐，避免漏加字段
    return uploadParseDocumentResultSchema.parse({
      id: created.id,
      title: created.title,
      status: created.status,
      wordCount: created.wordCount,
      contentLength: content.length,
      contentSummary: buildContentSummary(content),
      parser: converted.parser,
      imageCount,
      source: {
        fileName: file.originalname,
        fileType,
        mimeType,
        size: file.size,
        url: sourceUrl,
      },
      createdAt: created.createdAt,
    });
  }

  /**
   * 把解析器抽出的图片转存到 RustFS，并把 Markdown 里的本地引用改成对象 URL
   * 同一引用只上传一次；单张失败跳过该张，引用保持原样
   */
  private async storeImages(
    converted: ConvertedDocument,
  ): Promise<{ content: string; imageCount: number }> {
    const urlByReference = new Map<string, string>();

    for (const [reference, image] of converted.images) {
      try {
        const url = await this.rustfs.uploadBytes(image.bytes, {
          fileName: image.fileName,
          contentType: image.contentType,
          prefix: DOCUMENT_IMAGE_PREFIX,
        });
        urlByReference.set(reference, url);
      } catch (err) {
        this.logger.warn(
          `图片上传失败: name=${image.fileName}, ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return {
      content: replaceImageReferences(converted.markdown, (reference) =>
        urlByReference.get(reference),
      ),
      imageCount: urlByReference.size,
    };
  }
}

/** 业务错误响应体 `{ statusCode, code, message }`；`message` 不含解析器原文 */
function uploadError(
  status: HttpStatus,
  code: DocumentUploadErrorCode,
  message: string,
): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}

/** 未传标题时用去掉扩展名的文件名；去完为空则用占位标题 */
function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || UNTITLED_DOCUMENT_TITLE;
}

export { DocumentParseService };
