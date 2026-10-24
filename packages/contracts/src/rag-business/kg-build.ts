import { z } from 'zod';

/**
 * @description KG 建图范围：按文档 ID 列表重建或删除知识图谱。
 * 源项目（knowledge-hub-backend）还有 BUILD_ALL，但当前无生产者；
 * 全量重建属于批处理任务，应走外部调度 publisher，不在 v1 暴露。
 */
const RagBusinessKgBuildTypeSchema = z.enum(['BY_DOC_IDS', 'DELETE_BY_DOC_IDS']);

/**
 * @description 文档发布 / 删除后投递的 KG 建图命令（v1）。
 * 与 RAG 重建命令同形：只带文档 ID，不携带正文，消费者自行读库。
 */
const RagBusinessKgBuildMessageV1Schema = z.object({
  schemaVersion: z.literal(1).default(1),
  taskId: z.string().uuid(),
  type: RagBusinessKgBuildTypeSchema,
  documentIds: z.array(z.string().min(1)).min(1),
});

/**
 * @description 发布侧可省略 schemaVersion，消费侧解析后一定带 1。
 */
type RagBusinessKgBuildMessageV1Input = z.input<typeof RagBusinessKgBuildMessageV1Schema>;

/**
 * @description 校验后的 KG 建图命令。
 */
type RagBusinessKgBuildMessageV1 = z.output<typeof RagBusinessKgBuildMessageV1Schema>;

export type { RagBusinessKgBuildMessageV1, RagBusinessKgBuildMessageV1Input };
export { RagBusinessKgBuildMessageV1Schema, RagBusinessKgBuildTypeSchema };
