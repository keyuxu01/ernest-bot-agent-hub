/**
 * OOXML `<a:t>` 文本反转义
 * `&amp;` 必须最后解，否则会把 `&amp;lt;` 先变成 `&lt;` 再变成 `<`
 */
function decodeXmlText(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      codePointToChar(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => codePointToChar(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 非法码点直接丢掉，避免 `String.fromCodePoint` 抛错中断整页解析 */
function codePointToChar(codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return '';
  }
  return String.fromCodePoint(codePoint);
}

export { decodeXmlText };
