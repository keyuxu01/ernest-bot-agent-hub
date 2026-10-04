import { documentFileTypeSchema } from '../schemas/document-upload.zod';
import type { DocumentFileType } from '../type/document-upload.types';

/**
 * 按扩展名（不区分大小写）判断源文件类型；不支持则返回 null
 * 不看客户端 Content-Type：浏览器给 md / pptx 的 MIME 并不稳定
 */
function detectDocumentFileType(fileName: string): DocumentFileType | null {
  const ext = /\.([^./\\]+)$/.exec(fileName.trim())?.[1]?.toLowerCase();
  const parsed = documentFileTypeSchema.safeParse(ext);
  return parsed.success ? parsed.data : null;
}

/** txt / md 直接按 UTF-8 读取，不走格式解析器 */
function isPlainTextFileType(fileType: DocumentFileType): boolean {
  return fileType === 'txt' || fileType === 'md';
}

export { detectDocumentFileType, isPlainTextFileType };
