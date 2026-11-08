import { z } from 'zod';

/** 长期记忆分类器结构化输出 */
const ChatMemoryClassificationSchema = z.object({
  write_user: z
    .boolean()
    .describe(
      '写入用户层：换会话仍应保留的身份、岗位、回答偏好、长期约束。不含本轮任务、不含知识库条文。',
    ),
  write_session: z
    .boolean()
    .describe('写入会话层：仅当前会话的任务、进度、待办、临时约定。'),
  reason: z.string().describe('分类理由，一句话'),
});

export { ChatMemoryClassificationSchema };
