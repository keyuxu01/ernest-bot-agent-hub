import { describe, expect, it } from 'vitest';
import { RagBusinessKgBuildMessageV1Schema } from './kg-build';

const validMessage = {
  taskId: '11111111-1111-4111-8111-111111111111',
  type: 'BY_DOC_IDS',
  documentIds: ['10001'],
};

describe('RagBusinessKgBuildMessageV1Schema', () => {
  it('accepts a command without schemaVersion and defaults it to 1', () => {
    expect(RagBusinessKgBuildMessageV1Schema.parse(validMessage)).toEqual({
      ...validMessage,
      schemaVersion: 1,
    });
  });

  it('accepts a delete command', () => {
    expect(
      RagBusinessKgBuildMessageV1Schema.parse({
        ...validMessage,
        type: 'DELETE_BY_DOC_IDS',
      }).type,
    ).toBe('DELETE_BY_DOC_IDS');
  });

  it('rejects an empty document id list', () => {
    expect(() =>
      RagBusinessKgBuildMessageV1Schema.parse({
        ...validMessage,
        documentIds: [],
      }),
    ).toThrow();
  });

  it('rejects BUILD_ALL, which v1 does not expose', () => {
    expect(() =>
      RagBusinessKgBuildMessageV1Schema.parse({
        ...validMessage,
        type: 'BUILD_ALL',
      }),
    ).toThrow();
  });

  it('rejects an unsupported schema version', () => {
    expect(() =>
      RagBusinessKgBuildMessageV1Schema.parse({
        ...validMessage,
        schemaVersion: 2,
      }),
    ).toThrow();
  });
});
