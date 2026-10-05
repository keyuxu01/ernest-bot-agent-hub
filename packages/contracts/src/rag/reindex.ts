import { z } from 'zod';

/**
 * @description RAG 重建范围：当前只支持按文档 ID 列表重建。
 */
const RagReindexTypeSchema = z.enum(['BY_DOC_IDS']);

/**
 * @description 文档发布后投递的 RAG 重建命令（v1）。
 * 消息只带标识，不携带正文，避免把文档内容送进 broker。
 */
const RagReindexMessageV1Schema = z.object({
  schemaVersion: z.literal(1).default(1),
  taskId: z.string().uuid(),
  type: RagReindexTypeSchema,
  documentIds: z.array(z.string().min(1)).min(1),
});

/**
 * @description 发布侧可省略 schemaVersion，消费侧解析后一定带 1。
 */
type RagReindexMessageV1Input = z.input<typeof RagReindexMessageV1Schema>;

/**
 * @description 校验后的 RAG 重建命令。
 */
type RagReindexMessageV1 = z.output<typeof RagReindexMessageV1Schema>;

export type { RagReindexMessageV1, RagReindexMessageV1Input };
export { RagReindexMessageV1Schema, RagReindexTypeSchema };
