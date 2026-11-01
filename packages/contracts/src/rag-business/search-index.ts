import { z } from 'zod';

/** 搜索索引命令类型：INDEX 写入 / 覆盖，DELETE 删除 */
const RagBusinessSearchIndexTypeSchema = z.enum(['INDEX', 'DELETE']);

/**
 * 文档搜索索引消息（kh_document）
 *
 * 只带文档 ID：INDEX 由消费者从 Postgres + Mongo 读取全文再写 ES，
 * 与 RAG / KG 消息一致，正文不进 broker，也不再截断。
 * 旧版消息多带的 `document` 快照字段会被忽略。
 */
const RagBusinessSearchIndexMessageV1Schema = z.object({
  schemaVersion: z.literal(1).default(1),
  taskId: z.string().uuid(),
  type: RagBusinessSearchIndexTypeSchema,
  documentId: z.string().min(1),
});

type RagBusinessSearchIndexType = z.output<typeof RagBusinessSearchIndexTypeSchema>;
type RagBusinessSearchIndexMessageV1Input = z.input<
  typeof RagBusinessSearchIndexMessageV1Schema
>;
type RagBusinessSearchIndexMessageV1 = z.output<
  typeof RagBusinessSearchIndexMessageV1Schema
>;

export { RagBusinessSearchIndexMessageV1Schema, RagBusinessSearchIndexTypeSchema };
export type {
  RagBusinessSearchIndexMessageV1,
  RagBusinessSearchIndexMessageV1Input,
  RagBusinessSearchIndexType,
};
