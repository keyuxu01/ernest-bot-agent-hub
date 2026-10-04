import { Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { IMAGE_EXTENSION_BY_CONTENT_TYPE } from '../constants/document-upload.constants';
import { cleanMarkdown, toMarkdownTable } from './markdown-format';
import { sniffImageContentType } from './sniff-image-content-type';
import type {
  ExtractedImage,
  ParsedMarkdown,
} from '../type/document-convert.types';

const logger = new Logger('PdfParser');
/** 宽或高小于该像素的图视为装饰，跳过 */
const IMAGE_THRESHOLD = 50;

/**
 * PDF → Markdown
 *
 * 1. 按页取文本
 * 2. 按页抽图（小图跳过），写入本地引用 `images/p{页}-{序号}.{ext}`
 * 3. 每页：文本 + 该页图片
 * 4. 正文还没有 Markdown 表格时，把 `getTable()` 结果追加到文末
 *
 * 整批抽图失败只降级为纯文本；单张图失败跳过该张
 */
async function parsePdf(bytes: Buffer): Promise<ParsedMarkdown> {
  const parser = new PDFParse({ data: bytes });
  const images = new Map<string, ExtractedImage>();

  try {
    const textResult = await parser.getText();
    const pageTexts = textResult.pages ?? [];
    const pageImageRefs = new Map<number, string[]>();

    try {
      const imageResult = await parser.getImage({
        imageThreshold: IMAGE_THRESHOLD,
        imageBuffer: true,
        imageDataUrl: false,
      });

      for (const page of imageResult.pages ?? []) {
        const refs: string[] = [];
        let imgIdx = 0;
        for (const image of page.images ?? []) {
          if (
            (image.width > 0 && image.width < IMAGE_THRESHOLD) ||
            (image.height > 0 && image.height < IMAGE_THRESHOLD)
          ) {
            continue;
          }
          if (!image.data?.length) continue;

          // PDF 内嵌图常缺可靠 MIME，只能靠文件头；认不出的位图跳过
          const contentType = sniffImageContentType(image.data);
          const ext = contentType
            ? IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType]
            : undefined;
          if (!contentType || !ext) continue;

          const reference = `images/p${page.pageNumber}-${imgIdx}.${ext}`;
          images.set(reference, {
            bytes: image.data,
            contentType,
            fileName: `pdf_p${page.pageNumber}_${imgIdx}.${ext}`,
          });
          refs.push(reference);
          imgIdx += 1;
        }
        if (refs.length) pageImageRefs.set(page.pageNumber, refs);
      }
    } catch (err) {
      logger.warn(
        `PDF 图片提取失败，继续仅文本: ${err instanceof Error ? err.message : err}`,
      );
    }

    const parts: string[] = [];
    if (pageTexts.length > 0) {
      for (const page of pageTexts) {
        const text = (page.text ?? '').trim();
        if (text) parts.push(text);
        // getText() 用 `num`，getImage() 用 `pageNumber`，都是 1-based 页码
        for (const reference of pageImageRefs.get(page.num) ?? []) {
          parts.push(`![](${reference})`);
        }
      }
    } else {
      const fallback = (textResult.text ?? '').trim();
      if (fallback) parts.push(fallback);
      for (const refs of pageImageRefs.values()) {
        for (const reference of refs) parts.push(`![](${reference})`);
      }
    }

    let markdown = cleanMarkdown(parts.join('\n\n'));

    try {
      const tableResult = await parser.getTable();
      const pages = tableResult.pages ?? [];
      // 正文已有 GFM 表头分隔行时不再追加，避免和页面文本里的表格重复
      if (pages.length > 0 && !markdown.includes('| ---')) {
        const tableParts: string[] = [];
        let tableIdx = 0;
        for (const page of pages) {
          for (const table of page.tables ?? []) {
            const rows = normalizePdfTable(table);
            if (rows.length === 0) continue;
            tableIdx += 1;
            tableParts.push(`### 表格 ${tableIdx}\n\n${toMarkdownTable(rows)}`);
          }
        }
        if (tableParts.length > 0) {
          markdown = cleanMarkdown(
            `${markdown}\n\n## 检测到的表格\n\n${tableParts.join('\n\n')}`,
          );
        }
      }
    } catch {
      // 表格提取失败不影响主结果
    }

    return { markdown, images };
  } finally {
    // pdf-parse 底层有 wasm / worker，不销毁会泄漏
    await parser.destroy();
  }
}

/**
 * `getTable()` 结构不固定：可能是 `string[][]`，也可能套在 `{ rows }` / `{ data }` 里
 * 统一成二维字符串，认不出则当空表
 */
function normalizePdfTable(raw: unknown): string[][] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (Array.isArray(raw[0])) {
      return (raw as unknown[][]).map((row) =>
        row.map((cell) => String(cell ?? '').trim()),
      );
    }
    const merged: string[][] = [];
    for (const item of raw) merged.push(...normalizePdfTable(item));
    return merged;
  }

  if (typeof raw === 'object') {
    const obj = raw as { rows?: unknown; data?: unknown };
    if (obj.rows) return normalizePdfTable(obj.rows);
    if (obj.data) return normalizePdfTable(obj.data);
  }

  return [];
}

export { parsePdf };
