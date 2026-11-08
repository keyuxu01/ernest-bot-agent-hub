import type { ChatStreamDto } from '../dto/chat-stream.dto';

/**
 * @description 从 AI SDK UI messages 中提取最后一条用户消息的全部文本片段
 * @param messages ChatStreamDto['messages'] | undefined，前端提交的消息数组
 * @returns string，合并并去除前后空白的最后一条用户文本；不存在时为空串
 */
function lastUserText(messages: ChatStreamDto['messages'] | undefined): string {
  if (!messages?.length) return '';
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    return (message.parts ?? [])
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('')
      .trim();
  }
  return '';
}

export { lastUserText };
