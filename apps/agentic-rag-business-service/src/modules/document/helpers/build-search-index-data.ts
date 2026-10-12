import type { RagBusinessSearchDocument } from '@repo/contracts';
import type { DocumentEntity } from '../entities/document.entity';

/** 组装写入 ES kh_document 的文档快照 */
function buildSearchIndexData(
  document: DocumentEntity,
  content?: string | null,
): RagBusinessSearchDocument {
  let contentPreview: string | undefined;
  if (content) {
    contentPreview =
      content.length > 1000 ? content.substring(0, 1000) : content;
  }

  return {
    id: document.id,
    title: document.title,
    summary: document.summary ?? null,
    content: contentPreview ?? null,
    categoryId: document.categoryId ?? null,
    tags: document.tags ?? null,
    status: document.status,
    isPublic: document.isPublic,
    viewCount: document.viewCount,
    likeCount: document.likeCount,
    commentCount: document.commentCount,
    authorId: document.authorId ?? null,
    publishTime: document.publishTime?.toISOString() ?? null,
    createdAt: document.createdAt?.toISOString() ?? null,
    updatedAt: document.updatedAt?.toISOString() ?? null,
  };
}

export { buildSearchIndexData };
