import { describe, expect, it } from 'vitest';
import { RagBusinessSearchIndexMessageV1Schema } from './search-index';
import { RagBusinessReindexMessageV1Schema } from './reindex';
const base = { taskId: '123e4567-e89b-42d3-a456-426614174000', documentId: '1' };
const document = {
  id: '1',
  title: '标题',
  content: '正文',
  summary: null,
  categoryId: null,
  tags: null,
  status: 1,
  isPublic: false,
  viewCount: 0,
  likeCount: 0,
  commentCount: 0,
  authorId: null,
  publishTime: null,
  createdAt: null,
  updatedAt: null,
};
describe('搜索消息契约', () => {
  it('accepts index snapshots and id-only deletes with version 1', () => {
    expect(
      RagBusinessSearchIndexMessageV1Schema.parse({ ...base, type: 'INDEX', document })
        .schemaVersion,
    ).toBe(1);
    expect(
      RagBusinessSearchIndexMessageV1Schema.parse({ ...base, type: 'DELETE' }).type,
    ).toBe('DELETE');
    expect(
      RagBusinessReindexMessageV1Schema.parse({
        taskId: base.taskId,
        type: 'DELETE_BY_DOC_IDS',
        documentIds: ['1'],
      }).type,
    ).toBe('DELETE_BY_DOC_IDS');
  });
  it.each([
    { ...base, type: 'INDEX' },
    { ...base, type: 'INDEX', document: { ...document, id: '2' } },
    { ...base, type: 'INDEX', document: { ...document, content: 'x'.repeat(1001) } },
    { ...base, type: 'DELETE', schemaVersion: 2 },
    { ...base, type: 'OTHER' },
  ])('rejects malformed or incompatible messages', message => {
    expect(RagBusinessSearchIndexMessageV1Schema.safeParse(message).success).toBe(false);
  });
});
