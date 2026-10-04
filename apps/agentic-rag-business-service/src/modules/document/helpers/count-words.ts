/**
 * 统计正文字数（中英混合）
 * - 中日韩汉字：每个字符计 1 字
 * - 英文等拉丁文本：按空白分词，每个单词计 1 字
 */
export function countWords(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) return 0;

  // 匹配所有 CJK 统一汉字（U+4E00–U+9FFF），每个汉字算 1
  const cjk = (trimmed.match(/[\u4e00-\u9fff]/g) ?? []).length;

  // 去掉汉字后，剩余按空白切分为英文单词再计数
  const latin = trimmed
    .replace(/[\u4e00-\u9fff]/g, ' ') // 汉字替换为空格，避免与英文粘连
    .trim()
    .split(/\s+/) // 按连续空白分词
    .filter(Boolean).length; // 去掉空串

  return cjk + latin;
}
