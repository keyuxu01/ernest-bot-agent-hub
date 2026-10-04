import { describe, expect, it } from 'vitest';
import { buildChunkDocument } from './build-chunk-document';

describe('buildChunkDocument', () => {
  it('maps chunk fields and omits an empty embedding', () => {
    const doc = buildChunkDocument({
      chunkId: 'abc',
      documentId: '10001',
      documentTitle: '标题',
      content: '正文',
      heading: null,
      chunkIndex: 0,
      totalChunks: 1,
    });

    expect(doc).toMatchObject({
      chunk_id: 'abc',
      document_id: '10001',
      document_title: '标题',
      content: '正文',
      heading: null,
      chunk_index: 0,
      total_chunks: 1,
    });
    expect(doc).not.toHaveProperty('embedding');
    expect(typeof doc.indexed_at).toBe('string');
  });
});
