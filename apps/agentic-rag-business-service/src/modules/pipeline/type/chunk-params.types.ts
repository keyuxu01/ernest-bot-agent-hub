/** ChunkingService.chunk 入参 */
type ChunkDocumentParams = {
  content: string;
  documentId: string;
  documentTitle: string;
  categoryId?: string | null;
  authorId?: string | null;
  teamId?: string | null;
  docStatus?: number | null;
  publishTime?: string | null;
};

export type { ChunkDocumentParams };
