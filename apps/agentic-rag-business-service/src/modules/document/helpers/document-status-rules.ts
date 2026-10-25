import { DocumentStatus } from '../entities/document.entity';

/**
 * 文档状态流转规则（纯函数）
 *
 * Draft ─publish/submit─► PendingReview ─approve─► Published
 * PendingReview ─reject─► Draft
 * Published ─archive─► Archived；Published ─save-draft─► Draft
 * 免审模式下 publish 直接 → Published。
 *
 * 归档文档重新上架与草稿一样受审核开关约束，不能绕过审核。
 */

/** 可发起发布（需审 → 提审；免审 → 直接发布）；已发布再次发布 = 重建索引 */
function canPublishFrom(status: DocumentStatus): boolean {
  return (
    status === DocumentStatus.Draft ||
    status === DocumentStatus.Published ||
    status === DocumentStatus.Archived
  );
}

/** 可提交审核：与可发布来源一致 */
function canSubmitReviewFrom(status: DocumentStatus): boolean {
  return canPublishFrom(status);
}

/** 仅已发布可归档 */
function canArchiveFrom(status: DocumentStatus): boolean {
  return status === DocumentStatus.Published;
}

/** 仅已发布可存为草稿（下架编辑） */
function canSaveAsDraftFrom(status: DocumentStatus): boolean {
  return status === DocumentStatus.Published;
}

export {
  canArchiveFrom,
  canPublishFrom,
  canSaveAsDraftFrom,
  canSubmitReviewFrom,
};
