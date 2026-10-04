/** 创建 Mongo 正文文档时的输入（与 PG 元数据通过 documentId / contentId 关联） */
export type CreateDocumentContentInput = {
  /** 对应 `kh_document.id`（雪花 string） */
  documentId: string;
  /** Markdown 正文 */
  content: string;
  /** 正文字符数 */
  contentLength: number;
  /** 预览摘要（通常由 Service 从正文截取或使用用户传入 summary） */
  contentSummary: string;
  /** 版本号，默认 1 */
  version?: number;
  /** 软删标记，默认 false */
  deleted?: boolean;
};
