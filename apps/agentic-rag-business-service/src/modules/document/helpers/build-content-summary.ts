/**
 * 从正文截取预览摘要
 * 压缩连续空白后截断到 maxLen，超出则追加省略号
 */
export function buildContentSummary(content: string, maxLen = 200): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  return trimmed.length <= maxLen
    ? trimmed
    : `${trimmed.slice(0, maxLen)}...`;
}
