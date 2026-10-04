import type { DocumentEntity } from '../../document/entities/document.entity';
import type { PipelineDocument } from '../type/pipeline.types';

/** Postgres 实体 + Mongo 正文 → 管线统一快照 */
function toPipelineDocument(
  doc: DocumentEntity,
  content: string,
): PipelineDocument {
  return {
    id: doc.id,
    title: doc.title,
    content,
    summary: doc.summary,
    categoryId: doc.categoryId,
    authorId: doc.authorId,
    teamId: doc.teamId,
    status: doc.status,
    tags: doc.tags,
    isPublic: doc.isPublic,
    viewCount: doc.viewCount,
    likeCount: doc.likeCount,
    commentCount: doc.commentCount,
    publishTime: doc.publishTime,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export { toPipelineDocument };
