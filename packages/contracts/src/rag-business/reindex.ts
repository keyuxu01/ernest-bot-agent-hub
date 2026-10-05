import { z } from 'zod';

/**
 * @description RAG 重建范围：当前只支持按文档 ID 列表重建。
 */
const RagBusinessReindexTypeSchema = z.enum(['BY_DOC_IDS']);

/**
 * @description 文档发布后投递的 RAG 重建命令（v1）。
 * 消息只带标识，不携带正文，避免把文档内容送进 broker。
 */
const RagBusinessReindexMessageV1Schema = z.object({
  schemaVersion: z.literal(1).default(1),
  taskId: z.string().uuid(),
  type: RagBusinessReindexTypeSchema,
  documentIds: z.array(z.string().min(1)).min(1),
});

/**
 * @description 发布侧可省略 schemaVersion，消费侧解析后一定带 1。
 */
type RagBusinessReindexMessageV1Input = z.input<
  typeof RagBusinessReindexMessageV1Schema
>;

/**
 * @description 校验后的 RAG 重建命令。
 */
type RagBusinessReindexMessageV1 = z.output<
  typeof RagBusinessReindexMessageV1Schema
>;

export type { RagBusinessReindexMessageV1, RagBusinessReindexMessageV1Input };
export { RagBusinessReindexMessageV1Schema, RagBusinessReindexTypeSchema };
