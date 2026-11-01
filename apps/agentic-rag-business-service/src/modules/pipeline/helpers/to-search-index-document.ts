import type { SearchIndexDocument } from '../../../infrastructure/elasticsearch/type/search-document.types';
import type { PipelineDocument } from '../type/pipeline.types';
import { toIsoDate } from './to-iso-date';

/**
 * @description Postgres 元数据 + Mongo 全文 → ES kh_document 文档
 * @param doc PipelineDocument，管线已加载的文档快照
 * @returns SearchIndexDocument，写入 kh_document 的整篇记录（正文不截断）
 */
function toSearchIndexDocument(doc: PipelineDocument): SearchIndexDocument {
  return {
    id: doc.id,
    title: doc.title,
    summary: doc.summary ?? null,
    content: doc.content ?? '',
    categoryId: doc.categoryId ?? null,
    tags: doc.tags ?? null,
    status: doc.status,
    isPublic: doc.isPublic,
    viewCount: doc.viewCount,
    likeCount: doc.likeCount,
    commentCount: doc.commentCount,
    authorId: doc.authorId ?? null,
    publishTime: toIsoDate(doc.publishTime),
    createdAt: toIsoDate(doc.createdAt),
    updatedAt: toIsoDate(doc.updatedAt),
  };
}

export { toSearchIndexDocument };
