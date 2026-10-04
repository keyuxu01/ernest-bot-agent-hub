import mammoth from 'mammoth';
import TurndownService from 'turndown';
// 包没有类型声明，ESM named import 过不了 check-types
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gfm } = require('turndown-plugin-gfm') as {
  gfm: (service: TurndownService) => void;
};
import { imageExtensionForContentType } from './image-extension';
import { cleanMarkdown } from './markdown-format';
import type {
  ExtractedImage,
  ParsedMarkdown,
} from '../type/document-convert.types';

/** 同时覆盖英文与中文 Word 内置样式名，否则中文版「标题 N」会丢层级 */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='标题 1'] => h1:fresh",
  "p[style-name='标题 2'] => h2:fresh",
  "p[style-name='标题 3'] => h3:fresh",
  "p[style-name='标题 4'] => h4:fresh",
];

/**
 * DOCX → HTML（mammoth）→ Markdown（turndown + GFM）
 *
 * mammoth 默认把内嵌图写成 `data:` base64。这里改成抽出字节、正文只留本地引用，
 * 由 `DocumentParseService` 转存 RustFS。emf / wmf 也保留，不因浏览器难显示而丢掉。
 */
async function parseDocx(bytes: Buffer): Promise<ParsedMarkdown> {
  const images = new Map<string, ExtractedImage>();
  let imageIdx = 0;

  const { value: html } = await mammoth.convertToHtml(
    { buffer: bytes },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        const contentType = image.contentType || 'application/octet-stream';
        const ext = imageExtensionForContentType(contentType);
        const buffer = await image.readAsBuffer();
        const reference = `images/d${imageIdx}.${ext}`;
        images.set(reference, {
          bytes: buffer,
          contentType,
          fileName: `docx_${imageIdx}.${ext}`,
        });
        imageIdx += 1;
        return { src: reference };
      }),
    },
  );

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  // GFM：表格 / 删除线 / 任务列表，Word 里的表才能变成 Markdown 表
  turndown.use(gfm);

  return { markdown: cleanMarkdown(turndown.turndown(html)), images };
}

export { parseDocx };
