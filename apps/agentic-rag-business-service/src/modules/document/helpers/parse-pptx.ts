import { strFromU8 } from 'fflate';
import { decodeXmlText } from './decode-xml-text';
import { cleanMarkdown, toMarkdownTable } from './markdown-format';
import { unzipOfficeEntries } from './unzip-office-archive';
import type { ParsedMarkdown } from '../type/document-convert.types';

/** 只解幻灯片 XML；其它 OOXML 条目（主题、媒体）跳过 */
const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/i;

/**
 * PPTX → Markdown（自研 ZIP / XML）
 * 每页：`## 幻灯片 N`、表格、`### 标题`、其余段落
 * 抽表后从 XML 去掉 `<a:tbl>`，避免单元格文字再出现在正文
 */
function parsePptx(bytes: Buffer): ParsedMarkdown {
  const files = unzipOfficeEntries(bytes, (path) => SLIDE_PATH.test(path));
  const slidePaths = [...files.keys()].sort(
    (a, b) => slideNumber(a) - slideNumber(b),
  );
  if (slidePaths.length === 0) {
    throw new Error('PPTX 中没有幻灯片');
  }

  const parts: string[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const path = slidePaths[i];
    if (!path) continue;
    const xmlBytes = files.get(path);
    if (!xmlBytes) continue;
    const xml = strFromU8(xmlBytes);
    parts.push(`## 幻灯片 ${i + 1}`);

    const tables = extractTables(xml);
    for (const table of tables) {
      parts.push(toMarkdownTable(table));
    }

    const bodyXml = xml.replace(/<a:tbl[\s\S]*?<\/a:tbl>/g, '');
    const titleTexts = extractPlaceholderTexts(bodyXml, /ctrTitle|title/i);
    const used = new Set(titleTexts.map((text) => text.trim()).filter(Boolean));

    for (const title of titleTexts) {
      const text = title.trim();
      if (text) parts.push(`### ${text}`);
    }

    const bodyLines: string[] = [];
    for (const paragraph of extractParagraphTexts(bodyXml)) {
      const text = paragraph.trim();
      if (!text || used.has(text)) continue;
      bodyLines.push(text);
    }
    if (bodyLines.length > 0) parts.push(bodyLines.join('\n'));
  }

  const markdown = cleanMarkdown(parts.join('\n\n'));
  if (!markdown) throw new Error('PPTX 提取结果为空');
  return { markdown, images: new Map() };
}

/** 从 `ppt/slides/slide12.xml` 取页码，供排序（文件名顺序不等于播放顺序） */
function slideNumber(path: string): number {
  return Number(SLIDE_PATH.exec(path)?.[1] ?? 0);
}

/** 同一 `<a:p>` 内多个 `<a:t>` 合并，`<a:br/>` 当作换行 */
function extractParagraphTexts(xml: string): string[] {
  const paragraphs: string[] = [];
  const blocks = xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? [];
  for (const block of blocks) {
    const text = extractRunsText(block);
    if (text.trim()) paragraphs.push(text);
  }
  return paragraphs;
}

/** 按 shape 上的 `<p:ph type="title|ctrTitle">` 取标题，避免把正文当标题 */
function extractPlaceholderTexts(xml: string, typePattern: RegExp): string[] {
  const texts: string[] = [];
  const shapes = xml.split(/<p:sp[\s>]/).slice(1);
  for (const shape of shapes) {
    const placeholder = shape.match(/<p:ph[^>]*\btype="([^"]+)"/i);
    const type = placeholder?.[1];
    if (!type || !typePattern.test(type)) continue;
    const joined = extractParagraphTexts(shape).join('\n').trim();
    if (joined) texts.push(joined);
  }
  return texts;
}

/** `<a:tbl>` → 多表 → 行 → 单元格；单元格内多段落用空格拼成一格 */
function extractTables(xml: string): string[][][] {
  const tables: string[][][] = [];
  const tableBlocks = xml.match(/<a:tbl[\s\S]*?<\/a:tbl>/g) ?? [];

  for (const block of tableBlocks) {
    const rows: string[][] = [];
    const trBlocks = block.match(/<a:tr[\s\S]*?<\/a:tr>/g) ?? [];
    for (const tr of trBlocks) {
      const cells: string[] = [];
      const tcBlocks = tr.match(/<a:tc[\s\S]*?<\/a:tc>/g) ?? [];
      for (const tc of tcBlocks) {
        cells.push(extractParagraphTexts(tc).join(' ').trim());
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }

  return tables;
}

/** 收集 run 文本；数字实体（`&#x4E2D;`）必须在这里解开，正则拿不到解码后的字 */
function extractRunsText(xml: string): string {
  let result = '';
  const re = /<a:br\s*\/>|<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    if (match[0].startsWith('<a:br')) {
      result += '\n';
    } else {
      result += decodeXmlText(match[1] ?? '');
    }
  }
  return result;
}

export { parsePptx };
