import { Logger } from '@nestjs/common';
import { parseOffice } from 'officeparser';
import { cleanMarkdown } from './markdown-format';
import type { ParsedMarkdown } from '../type/document-convert.types';

const logger = new Logger('OfficeParserFallback');

type OfficeFallbackType = 'docx' | 'xlsx' | 'pptx';

/**
 * officeparser 兜底：AST → Markdown
 *
 * `extractAttachments: false`：8.x 默认不抽附件，但显式关掉，
 * 避免兜底路径把图片编成 base64 写进 Mongo。
 * `fileType` 必须传：从 Buffer 解析时它无法靠扩展名判断。
 */
async function parseOfficeFallback(
  bytes: Buffer,
  fileType: OfficeFallbackType,
): Promise<ParsedMarkdown> {
  const ast = await parseOffice(bytes, {
    fileType,
    extractAttachments: false,
  });
  const { value } = await ast.to('md');
  if (typeof value !== 'string') {
    logger.warn(`officeparser ${fileType} 产出不是 Markdown 字符串`);
    return { markdown: '', images: new Map() };
  }
  return { markdown: cleanMarkdown(value), images: new Map() };
}

export { parseOfficeFallback };
export type { OfficeFallbackType };
