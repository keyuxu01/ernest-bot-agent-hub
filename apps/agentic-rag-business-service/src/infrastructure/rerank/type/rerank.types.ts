/** DashScope text-rerank 接口响应（只列用到的字段） */
type DashScopeRerankResponse = {
  output?: {
    results?: Array<{
      /** 对应请求 documents 数组的下标 */
      index: number;
      /** 相关性得分 0-1，越高越相关 */
      relevance_score: number;
    }>;
  };
  /** 出错时的错误信息 */
  message?: string;
  /** 出错时的错误码 */
  code?: string;
};

export type { DashScopeRerankResponse };
