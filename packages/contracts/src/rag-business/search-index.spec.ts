import { describe, expect, it } from 'vitest';
import { RagBusinessSearchIndexMessageV1Schema } from './search-index';
import { RagBusinessReindexMessageV1Schema } from './reindex';

const base = { taskId: '123e4567-e89b-42d3-a456-426614174000', documentId: '1' };

describe('搜索消息契约', () => {
  it('accepts id-only index and delete messages with version 1', () => {
    expect(
      RagBusinessSearchIndexMessageV1Schema.parse({ ...base, type: 'INDEX' })
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

  it('drops the snapshot carried by older index messages', () => {
    const parsed = RagBusinessSearchIndexMessageV1Schema.parse({
      ...base,
      type: 'INDEX',
      document: { id: '1', title: '旧快照' },
    });

    expect(parsed).not.toHaveProperty('document');
  });

  it.each([
    { ...base, type: 'INDEX', documentId: '' },
    { taskId: base.taskId, type: 'INDEX' },
    { ...base, type: 'INDEX', taskId: 'not-a-uuid' },
    { ...base, type: 'DELETE', schemaVersion: 2 },
    { ...base, type: 'OTHER' },
  ])('rejects malformed or incompatible messages', message => {
    expect(RagBusinessSearchIndexMessageV1Schema.safeParse(message).success).toBe(false);
  });
});
