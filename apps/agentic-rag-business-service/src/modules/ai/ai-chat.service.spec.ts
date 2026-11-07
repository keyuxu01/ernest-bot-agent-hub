import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatModelService } from '../../infrastructure/chat-model/chat-model.service';
import type { ChunkHit } from '../../infrastructure/elasticsearch/type/chunk-hit.types';
import { AiChatService } from './ai-chat.service';
import type { HybridRetrievalService } from './hybrid-retrieval.service';

function hit(n: number, content = `正文${n}`): ChunkHit {
  return {
    chunkId: `c${n}`,
    documentId: `d${n}`,
    documentTitle: `文档${n}`,
    content,
    heading: n === 1 ? '章节' : null,
    score: 1 / n,
  };
}

const invoke = vi.fn();
const retrieval = { retrieve: vi.fn() };
let service: AiChatService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new AiChatService(
    { answerModel: { invoke } } as unknown as ChatModelService,
    retrieval as unknown as HybridRetrievalService,
  );
});

describe('AiChatService.chat', () => {
  it('returns hints without calling the LLM for blank questions or no hits', async () => {
    await expect(service.chat('  ')).resolves.toEqual({
      answer: '请输入问题。',
      sources: [],
    });
    retrieval.retrieve.mockResolvedValue([]);
    await expect(service.chat('问题')).resolves.toEqual({
      answer: '知识库里没有相关内容。',
      sources: [],
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('numbers the context and returns only cited sources', async () => {
    retrieval.retrieve.mockResolvedValue([hit(1), hit(2), hit(3)]);
    invoke.mockResolvedValue({ content: '先灰度 [3]，再放量 [1][9]。' });

    const result = await service.chat(' 怎么发布 ', 3);

    expect(retrieval.retrieve).toHaveBeenCalledWith('怎么发布', 3);
    const human = invoke.mock.calls[0]![0][1].content as string;
    expect(human).toContain('[1] 文档1 / 章节\n正文1');
    expect(human).toContain('[3] 文档3\n正文3');
    expect(human).toContain('用户问题：怎么发布');
    // [9] 越界忽略，按编号升序
    expect(result.sources.map((s) => s.index)).toEqual([1, 3]);
    expect(result.sources[0]).toMatchObject({
      documentId: 'd1',
      heading: '章节',
      excerpt: '正文1',
    });
  });

  it('falls back to all hits when the answer cites nothing and trims excerpts', async () => {
    const long = `${'字 '.repeat(150)}\n\n尾`;
    retrieval.retrieve.mockResolvedValue([hit(1, long), hit(2)]);
    invoke.mockResolvedValue({ content: '资料不足，不知道。' });

    const result = await service.chat('问题');

    expect(result.sources.map((s) => s.index)).toEqual([1, 2]);
    expect(result.sources[0]!.excerpt).toHaveLength(203);
    expect(result.sources[0]!.excerpt.endsWith('...')).toBe(true);
  });
});
