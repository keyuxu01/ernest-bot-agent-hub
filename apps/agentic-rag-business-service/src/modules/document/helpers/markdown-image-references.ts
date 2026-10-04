/**
 * Markdown 图片语法 `![alt](src)` / `![alt](src "title")`
 * 只覆盖解析器产出的 `![]()`；HTML `<img>` 等形式遇到真实样本再补
 */
const MARKDOWN_IMAGE = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

/** 收集正文中的图片地址（去重，保持出现顺序） */
function findImageReferences(markdown: string): string[] {
  return [
    ...new Set(
      Array.from(markdown.matchAll(MARKDOWN_IMAGE), ([, , src]) => src ?? ''),
    ),
  ].filter(Boolean);
}

/**
 * 替换图片地址；`replacementFor` 返回 undefined 的引用保持原样
 * 只改地址部分，alt 与 title 不动
 */
function replaceImageReferences(
  markdown: string,
  replacementFor: (reference: string) => string | undefined,
): string {
  return markdown.replace(
    MARKDOWN_IMAGE,
    (whole, head: string, src: string, tail: string) => {
      const url = replacementFor(src);
      return url === undefined ? whole : `${head}${url}${tail}`;
    },
  );
}

export { findImageReferences, replaceImageReferences };
