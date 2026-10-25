import { z } from 'zod';

/**
 * 文档状态流转与发布审核的稳定错误码（响应体 `{ statusCode, code, message }` 的 `code`）
 */
const documentLifecycleErrorCodeSchema = z.enum([
  /** 创建时只允许草稿或已发布 */
  'DOCUMENT_CREATE_STATUS_INVALID',
  /** 开启审核时不能直接创建为已发布 */
  'DOCUMENT_APPROVAL_REQUIRED',
  /** 当前状态不允许该操作（发布 / 归档 / 存草稿 / 提审） */
  'DOCUMENT_TRANSITION_NOT_ALLOWED',
  /** PATCH 只允许 Published → Draft，其余状态变更走专用接口 */
  'DOCUMENT_STATUS_CHANGE_NOT_ALLOWED',
  /** 待审核期间不可改标题 / 正文，也不可重复发布 */
  'DOCUMENT_UNDER_REVIEW',
  /** 开启审核时，已发布文档须先存为草稿再改标题 / 正文 */
  'DOCUMENT_PUBLISHED_EDIT_REQUIRES_DRAFT',
  /** 该文档已有待审核任务 */
  'DOCUMENT_REVIEW_ALREADY_PENDING',
  /** 审核任务不存在 */
  'DOCUMENT_REVIEW_NOT_FOUND',
  /** 审核任务已结案 */
  'DOCUMENT_REVIEW_ALREADY_CLOSED',
  /** 驳回必须填写意见 */
  'DOCUMENT_REVIEW_COMMENT_REQUIRED',
]);

export { documentLifecycleErrorCodeSchema };
