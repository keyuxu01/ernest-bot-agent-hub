import { z } from 'zod';
import { DocumentStatus } from '../entities/document.entity';

/** 上传解析支持的源文件类型（取自小写扩展名） */
const documentFileTypeSchema = z.enum([
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'txt',
  'md',
]);

/**
 * 实际产出 Markdown 的解析引擎
 * `officeparser` 只作为 docx / xlsx / pptx 主解析失败或结果为空时的兜底
 */
const documentParserSchema = z.enum([
  'plain-text',
  'pdf-parse',
  'mammoth',
  'exceljs',
  'pptx-xml',
  'officeparser',
]);

/** 上传解析接口的稳定错误码（响应体 `code` 字段） */
const documentUploadErrorCodeSchema = z.enum([
  'DOCUMENT_FILE_REQUIRED',
  'DOCUMENT_FILE_TOO_LARGE',
  'DOCUMENT_FILE_TYPE_UNSUPPORTED',
  'DOCUMENT_PARSE_FAILED',
  'DOCUMENT_PARSE_EMPTY',
]);

/**
 * Multer 内存存储产出的上传文件（只声明用到的字段）
 * 用于在 Service 入口校验 `@UploadedFile()`，未上传时为 undefined
 */
const uploadedDocumentFileSchema = z.object({
  originalname: z.string().min(1),
  mimetype: z.string(),
  size: z.number().int().nonnegative(),
  buffer: z.instanceof(Buffer),
});

/**
 * `POST /documents/upload/parse` 返回的草稿摘要（不含完整正文；返回前按此校验）
 * `source` 只在响应中返回，暂不持久化：原文件与文档的关联后续单独设计
 */
const uploadParseDocumentResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(DocumentStatus),
  wordCount: z.number().int().nonnegative(),
  contentLength: z.number().int().nonnegative(),
  contentSummary: z.string(),
  parser: documentParserSchema,
  /** 转存到 RustFS 的图片数 */
  imageCount: z.number().int().nonnegative(),
  source: z.object({
    fileName: z.string().min(1),
    fileType: documentFileTypeSchema,
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
    /** RustFS 原文件 URL */
    url: z.url(),
  }),
  createdAt: z.date(),
});

export {
  documentFileTypeSchema,
  documentParserSchema,
  documentUploadErrorCodeSchema,
  uploadedDocumentFileSchema,
  uploadParseDocumentResultSchema,
};
