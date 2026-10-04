/** 更新 Mongo 正文时的字段（不含 version；由 Repository `$inc`） */
export type UpdateDocumentContentInput = {
  content: string;
  contentLength: number;
  contentSummary: string;
};
