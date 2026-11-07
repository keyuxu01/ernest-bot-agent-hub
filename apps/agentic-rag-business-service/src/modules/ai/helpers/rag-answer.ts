import type { ChunkHit } from '../../../infrastructure/elasticsearch/type/chunk-hit.types';
import {
  CITATION_RE,
  CONTEXT_SNIPPET_LEN,
  EXCERPT_LEN,
} from '../constants/ai-chat.constants';
import type { ChatSource } from '../type/ai-chat.types';

/**
 * @description 把召回块拼成 prompt 里的「检索到的资料」：每块一段，编号 [1]、[2]… 与溯源对应
 * @param hits ChunkHit[]，精排后的块
 * @returns string，形如 `[1] 文档标题 / 章节\n正文`，块间空一行；单块正文超过 800 字截断
 */
function buildContext(hits: ChunkHit[]): string {
  return hits
    .map((src, i) => {
      const heading = src.heading ? ` / ${src.heading}` : '';
      const snippet =
        src.content.length > CONTEXT_SNIPPET_LEN
          ? `${src.content.slice(0, CONTEXT_SNIPPET_LEN)}...`
          : src.content;
      return `[${i + 1}] ${src.documentTitle}${heading}\n${snippet}`;
    })
    .join('\n\n');
}

/**
 * @description 从回答里抽出 [n]，只返回实际引用的资料；回答没有任何有效编号时回退为全部召回
 * @param answer string，LLM 回答
 * @param hits ChunkHit[]，送进 prompt 的块（下标 + 1 即编号）
 * @returns ChatSource[]，按编号升序的溯源；越界编号忽略
 */
function toCitedSources(answer: string, hits: ChunkHit[]): ChatSource[] {
  const cited = new Set<number>();
  for (const match of answer.matchAll(CITATION_RE)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= hits.length) cited.add(n);
  }
  const indexes =
    cited.size > 0
      ? [...cited].sort((a, b) => a - b)
      : hits.map((_, i) => i + 1);
  return indexes.map((index) => toSource(index, hits[index - 1]!));
}

/**
 * @description 召回块 → 溯源条目（只给摘录）
 * @param index number，资料编号
 * @param hit ChunkHit，对应的块
 * @returns ChatSource，溯源条目
 */
function toSource(index: number, hit: ChunkHit): ChatSource {
  return {
    index,
    documentId: hit.documentId,
    documentTitle: hit.documentTitle,
    heading: hit.heading,
    excerpt: excerpt(hit.content),
    score: hit.score,
  };
}

/**
 * @description 正文摘录：空白折叠成单个空格，超过 200 字截断
 * @param content string，块正文
 * @returns string，摘录
 */
function excerpt(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= EXCERPT_LEN) return text;
  return `${text.slice(0, EXCERPT_LEN)}...`;
}

export { buildContext, toCitedSources };
