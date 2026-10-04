import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import {
  CHARS_PER_TOKEN,
  HEADING_LINE,
} from './constants/chunking.constants';
import { extractHeading } from './helpers/extract-heading';
import type { ChunkDocumentParams } from './type/chunk-params.types';
import type { DocumentChunk } from './type/pipeline.types';

/**
 * 文档分块服务（LangChain RecursiveCharacterTextSplitter / markdown）
 *
 * RAG 不能整篇直接向量化：Embedding 有长度上限，检索也需要段落级命中。
 *
 * 策略：
 * 1. Markdown 感知分隔符递归切分
 * 2. chunkSize / chunkOverlap 控制大小与重叠
 * 3. 从块内标题行推断 heading，跨块继承并必要时前缀补全
 *
 * 配置：`RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP`（token；按 CHARS_PER_TOKEN 换算字符）
 */
@Injectable()
class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);
  private readonly splitter: RecursiveCharacterTextSplitter;

  constructor(config: ConfigService) {
    const chunkSizeTokens = config.getOrThrow<number>('RAG_CHUNK_SIZE');
    const chunkOverlapTokens = config.getOrThrow<number>('RAG_CHUNK_OVERLAP');
    const chunkSize = Math.floor(chunkSizeTokens * CHARS_PER_TOKEN);
    const chunkOverlap = Math.floor(chunkOverlapTokens * CHARS_PER_TOKEN);

    // 内置 markdown 分隔符未含 H1（\n# ），补上以免一级标题不切分
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      keepSeparator: true,
      separators: [
        '\n# ',
        ...RecursiveCharacterTextSplitter.getSeparatorsForLanguage('markdown'),
      ],
    });
  }

  /**
   * 将一篇文档正文切成可索引的 DocumentChunk 列表。
   * 内容为空时返回 []。
   */
  async chunk(params: ChunkDocumentParams): Promise<DocumentChunk[]> {
    const { content, documentId, documentTitle } = params;
    if (!content?.trim()) {
      this.logger.warn(`文档内容为空，跳过分块：documentId=${documentId}`);
      return [];
    }

    const texts = await this.splitter.splitText(content);
    const chunks: DocumentChunk[] = [];
    let currentHeading: string | null = null;

    for (const text of texts) {
      const trimmed = text.trim();
      if (!trimmed) {
        continue;
      }

      const headingInChunk = extractHeading(trimmed);
      if (headingInChunk) {
        currentHeading = headingInChunk;
      }

      // 同章节后续块通常不含标题行：前缀补上，便于检索命中时带上下文
      let chunkContent = trimmed;
      if (currentHeading && !HEADING_LINE.test(trimmed)) {
        chunkContent = `${currentHeading}\n\n${trimmed}`;
      }

      chunks.push({
        chunkId: createHash('sha256')
          .update(`${documentId}:${chunks.length}`)
          .digest('hex')
          .slice(0, 64),
        documentId,
        documentTitle,
        content: chunkContent,
        heading: currentHeading,
        chunkIndex: chunks.length,
        totalChunks: 0,
        categoryId: params.categoryId,
        authorId: params.authorId,
        teamId: params.teamId,
        docStatus: params.docStatus,
        publishTime: params.publishTime,
      });
    }

    const total = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalChunks = total;
    });

    this.logger.debug(
      `文档分块完成：documentId=${documentId}, totalChunks=${total}`,
    );
    return chunks;
  }
}

export { ChunkingService };
