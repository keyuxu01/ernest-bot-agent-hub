const DEFAULT_CHAT_SESSION_TITLE = '新对话';

/**
 * @description 从首个问题生成会话标题：压缩空白，最多取 30 字，超长时追加省略号
 * @param question string，用户问题
 * @returns string，会话标题；问题为空时返回“新对话”
 */
function titleFromQuestion(question: string): string {
  const text = question.replace(/\s+/g, ' ').trim();
  if (!text) return DEFAULT_CHAT_SESSION_TITLE;
  return text.length > 30 ? `${text.slice(0, 30)}…` : text;
}

export { DEFAULT_CHAT_SESSION_TITLE, titleFromQuestion };
