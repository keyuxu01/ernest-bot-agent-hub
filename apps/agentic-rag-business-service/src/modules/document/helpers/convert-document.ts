import { Logger } from '@nestjs/common';
import type {
  ConvertedDocument,
  ParsedMarkdown,
} from '../type/document-convert.types';
import type {
  DocumentFileType,
  DocumentParser,
} from '../type/document-upload.types';
import {
  parseOfficeFallback,
  type OfficeFallbackType,
} from './parse-office-fallback';
import { parseDocx } from './parse-docx';
import { parsePdf } from './parse-pdf';
import { parsePlainText } from './parse-plain-text';
import { parsePptx } from './parse-pptx';
import { parseXlsx } from './parse-xlsx';

const logger = new Logger('ConvertDocument');

/**
 * 按扩展名分发到各格式解析器（纯函数，不做对象存储 I/O）
 *
 * - pdf 只走 `pdf-parse`，没有 officeparser 兜底（它对扫描件/版面也帮不上忙）
 * - docx / xlsx / pptx：主路径抛错或 Markdown 为空时再试 officeparser，
 *   响应里的 `parser` 会标成 `officeparser`，便于区分走了哪条路
 */
async function convertDocument(
  fileType: DocumentFileType,
  bytes: Buffer,
): Promise<ConvertedDocument> {
  switch (fileType) {
    case 'txt':
    case 'md':
      return { ...parsePlainText(bytes), parser: 'plain-text' };
    case 'pdf':
      return { ...(await parsePdf(bytes)), parser: 'pdf-parse' };
    case 'docx':
      return withOfficeFallback(bytes, 'docx', 'mammoth', () =>
        parseDocx(bytes),
      );
    case 'xlsx':
      return withOfficeFallback(bytes, 'xlsx', 'exceljs', () =>
        parseXlsx(bytes),
      );
    case 'pptx':
      return withOfficeFallback(bytes, 'pptx', 'pptx-xml', async () =>
        parsePptx(bytes),
      );
  }
}

/** 空结果也降级：损坏包有时不抛错、只吐出空白 */
async function withOfficeFallback(
  bytes: Buffer,
  fileType: OfficeFallbackType,
  primaryParser: DocumentParser,
  primary: () => Promise<ParsedMarkdown>,
): Promise<ConvertedDocument> {
  try {
    const parsed = await primary();
    if (parsed.markdown.trim()) {
      return { ...parsed, parser: primaryParser };
    }
    logger.warn(`${fileType} 主解析结果为空，降级 officeparser`);
  } catch (err) {
    logger.warn(
      `${fileType} 主解析失败，降级 officeparser: ${err instanceof Error ? err.message : err}`,
    );
  }

  return {
    ...(await parseOfficeFallback(bytes, fileType)),
    parser: 'officeparser',
  };
}

export { convertDocument };
