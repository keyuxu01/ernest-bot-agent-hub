import { describe, expect, it } from 'vitest';
import { RagReindexMessageV1Schema } from './rag-reindex';

const validMessage = {
  taskId: '11111111-1111-4111-8111-111111111111',
  type: 'BY_DOC_IDS',
  documentIds: ['10001'],
};

describe('RagReindexMessageV1Schema', () => {
  it('accepts a command without schemaVersion and defaults it to 1', () => {
    expect(RagReindexMessageV1Schema.parse(validMessage)).toEqual({
      ...validMessage,
      schemaVersion: 1,
    });
  });

  it('rejects an empty document id list', () => {
    expect(() =>
      RagReindexMessageV1Schema.parse({
        ...validMessage,
        documentIds: [],
      }),
    ).toThrow();
  });

  it('rejects an unknown reindex type', () => {
    expect(() =>
      RagReindexMessageV1Schema.parse({
        ...validMessage,
        type: 'BY_CATEGORY',
      }),
    ).toThrow();
  });
});
