import { z } from 'zod';

/** 检索查询改写器结构化输出 */
const ChatQueryRewriteSchema = z.object({
  standalone_query: z
    .string()
    .describe('可独立检索的一句中文短查询，消解指代和省略，不含寒暄'),
  need_retrieve: z
    .boolean()
    .describe('是否需要查知识库。寒暄、致谢、与制度无关的闲聊为 false'),
});

export { ChatQueryRewriteSchema };
