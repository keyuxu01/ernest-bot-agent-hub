import { cleanMarkdown } from './markdown-format';
import type { ParsedMarkdown } from '../type/document-convert.types';

/**
 * TXT / MD 按 UTF-8 直读
 * TextDecoder 会去掉 BOM；再走 cleanMarkdown 统一换行
 */
function parsePlainText(bytes: Buffer): ParsedMarkdown {
  return {
    markdown: cleanMarkdown(new TextDecoder('utf-8').decode(bytes)),
    images: new Map(),
  };
}

export { parsePlainText };
