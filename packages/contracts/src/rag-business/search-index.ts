import { z } from 'zod';

/** 文档级搜索快照；正文仅携带前 1000 个 UTF-16 码元，不是完整正文。 */
const RagBusinessSearchDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  summary: z.string().nullable(),
  content: z.string().max(1000).nullable(),
  categoryId: z.string().nullable(),
  tags: z.string().nullable(),
  status: z.number().int(),
  isPublic: z.boolean(),
  viewCount: z.number().int(),
  likeCount: z.number().int(),
  commentCount: z.number().int(),
  authorId: z.string().nullable(),
  publishTime: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});

/** INDEX 必须携带快照且 ID 一致；DELETE 只需文档 ID。消费端必须再次校验。 */
const RagBusinessSearchIndexMessageV1Schema = z
  .discriminatedUnion('type', [
    z.object({
      schemaVersion: z.literal(1).default(1),
      taskId: z.string().uuid(),
      type: z.literal('INDEX'),
      documentId: z.string().min(1),
      document: RagBusinessSearchDocumentSchema,
    }),
    z.object({
      schemaVersion: z.literal(1).default(1),
      taskId: z.string().uuid(),
      type: z.literal('DELETE'),
      documentId: z.string().min(1),
    }),
  ])
  .refine(
    message => message.type === 'DELETE' || message.document.id === message.documentId,
    {
      message: '搜索快照 ID 与 documentId 不一致',
    },
  );

type RagBusinessSearchDocument = z.output<typeof RagBusinessSearchDocumentSchema>;
type RagBusinessSearchIndexMessageV1 = z.output<
  typeof RagBusinessSearchIndexMessageV1Schema
>;
export { RagBusinessSearchDocumentSchema, RagBusinessSearchIndexMessageV1Schema };
export type { RagBusinessSearchDocument, RagBusinessSearchIndexMessageV1 };
