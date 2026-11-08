import type { IndexableChunk } from '../type/indexable-chunk.types';

/** 把管线 chunk 转成 ES 文档字段（snake_case） */
function buildChunkDocument(chunk: IndexableChunk): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    chunk_id: chunk.chunkId,
    document_id: chunk.documentId,
    document_title: chunk.documentTitle,
    content: chunk.content,
    heading: chunk.heading ?? null,
    chunk_index: chunk.chunkIndex,
    total_chunks: chunk.totalChunks,
    category_id: chunk.categoryId ?? null,
    author_id: chunk.authorId ?? null,
    team_id: chunk.teamId ?? null,
    is_public: chunk.isPublic ?? false,
    doc_status: chunk.docStatus ?? null,
    publish_time: chunk.publishTime ?? null,
    indexed_at: new Date().toISOString(),
  };
  if (chunk.embedding?.length) {
    doc.embedding = chunk.embedding;
  }
  return doc;
}

export { buildChunkDocument };
