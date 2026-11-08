import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { AiMessageEntity } from '../entities/ai-message.entity';

/**
 * @description 读取 LangChain 消息的纯文本内容
 * @param message BaseMessage，LangChain human/ai 消息
 * @returns string，合并后的文本并去除前后空白
 */
function messageText(message: BaseMessage): string {
  const content = message.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return String(content ?? '').trim();
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return String((part as { text?: string }).text ?? '');
      }
      return '';
    })
    .join('')
    .trim();
}

/**
 * @description 判断消息是否属于短期工作窗口，只保留 human/ai 原文
 * @param message BaseMessage，待判断消息
 * @returns boolean，human 或 ai 消息时为 true
 */
function isWorkingMessage(message: BaseMessage): boolean {
  return HumanMessage.isInstance(message) || AIMessage.isInstance(message);
}

/**
 * @description 将 PostgreSQL 会话消息转换为 LangChain human/ai 消息
 * @param rows AiMessageEntity[]，按时间正序的数据库消息
 * @returns BaseMessage[]，过滤空正文和未知角色后的工作消息
 */
function dbRowsToMessages(rows: AiMessageEntity[]): BaseMessage[] {
  const messages: BaseMessage[] = [];
  for (const row of rows) {
    const text = row.content?.trim();
    if (!text) continue;
    if (row.role === 'user') messages.push(new HumanMessage(text));
    if (row.role === 'assistant') messages.push(new AIMessage(text));
  }
  return messages;
}

/**
 * @description 压缩最近四条消息供检索改写，助手消息截短以免制度原文污染查询
 * @param history BaseMessage[]，短期工作消息
 * @returns string，用户/助手标记的紧凑上下文
 */
function compactRewriteContext(history: BaseMessage[]): string {
  if (!history.length) return '';
  const lines: string[] = [];
  for (const message of history.slice(-4)) {
    const text = messageText(message);
    if (!text) continue;
    if (HumanMessage.isInstance(message)) {
      lines.push(`用户：${text.slice(0, 200)}`);
    } else if (AIMessage.isInstance(message)) {
      lines.push(`助手：${text.slice(0, 120)}`);
    }
  }
  return lines.join('\n');
}

export {
  compactRewriteContext,
  dbRowsToMessages,
  isWorkingMessage,
  messageText,
};
