/**
 * token → 字符的粗略换算系数。
 * 中英文混合场景偏保守：约 1 token ≈ 2 字符。
 */
const CHARS_PER_TOKEN = 2.0;

/** 匹配块内 Markdown ATX 标题行 */
const HEADING_LINE = /^(#{1,6})\s+(.+)$/m;

export { CHARS_PER_TOKEN, HEADING_LINE };
