/** 「同一文档最多一条待审」部分唯一索引名，见 init-scripts/postgresql/02-knowledge-hub.sql */
const DOCUMENT_REVIEW_PENDING_UNIQUE_INDEX = 'uq_kh_document_review_pending';

/** 待审期间文档被删除时，撤销任务写入的意见 */
const REVIEW_CANCELLED_ON_DELETE_COMMENT = '文档已删除，审核任务自动撤销';

/** 审核任务列表筛选值 */
const DOCUMENT_REVIEW_TASK_FILTERS = [
  'pending',
  'approved',
  'rejected',
] as const;

/** 审核开关环境变量；未配置时默认开启 */
const DOCUMENT_REQUIRE_APPROVAL_KEY = 'DOCUMENT_REQUIRE_APPROVAL';

export {
  DOCUMENT_REQUIRE_APPROVAL_KEY,
  DOCUMENT_REVIEW_PENDING_UNIQUE_INDEX,
  DOCUMENT_REVIEW_TASK_FILTERS,
  REVIEW_CANCELLED_ON_DELETE_COMMENT,
};
