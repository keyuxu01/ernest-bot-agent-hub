/** 返给前端的溯源条目（摘录，不含整块正文） */
type ChatSource = {
  /** 资料编号，与回答中的 [n] 对应 */
  index: number;
  documentId: string;
  documentTitle: string;
  heading: string | null;
  /** 块正文摘录，最多 200 字 */
  excerpt: string;
  /** 精排（或 RRF）得分 */
  score: number;
};

/** POST /ai/chat 响应 */
type ChatResult = {
  answer: string;
  sources: ChatSource[];
};

export type { ChatResult, ChatSource };
