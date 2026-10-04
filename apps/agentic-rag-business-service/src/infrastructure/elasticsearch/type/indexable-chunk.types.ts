/** 写入 ES `kh_chunk` 所需的最小块结构 */
type IndexableChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  heading?: string | null;
  chunkIndex: number;
  totalChunks: number;
  categoryId?: string | null;
  authorId?: string | null;
  teamId?: string | null;
  docStatus?: number | null;
  publishTime?: string | null;
  embedding?: number[];
};

export type { IndexableChunk };
