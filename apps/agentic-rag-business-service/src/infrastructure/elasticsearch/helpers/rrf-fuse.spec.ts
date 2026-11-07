import { describe, expect, it } from 'vitest';
import type { ChunkHit } from '../type/chunk-hit.types';
import { rrfFuse } from './rrf-fuse';

function hit(chunkId: string, score: number): ChunkHit {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    documentTitle: 't',
    content: 'c',
    heading: null,
    score,
  };
}

describe('rrfFuse', () => {
  it('ranks chunks found by both channels first and keeps raw scores', () => {
    const fused = rrfFuse(
      [hit('a', 9), hit('b', 5)],
      [hit('b', 0.9), hit('c', 0.8)],
      60,
    );

    expect(fused.map((h) => h.chunkId)).toEqual(['b', 'a', 'c']);
    // b：关键词第 2 名 + 向量第 1 名
    expect(fused[0]!.score).toBeCloseTo(1 / 62 + 1 / 61);
    expect(fused[0]).toMatchObject({ bm25Score: 5, vectorScore: 0.9 });
    expect(fused[1]).toMatchObject({ bm25Score: 9, vectorScore: 0 });
    expect(fused[2]).toMatchObject({ bm25Score: 0, vectorScore: 0.8 });
  });

  it('ranks each channel by its own score regardless of input order', () => {
    const fused = rrfFuse([hit('low', 1), hit('high', 7)], [], 60);

    expect(fused.map((h) => h.chunkId)).toEqual(['high', 'low']);
    expect(fused[0]!.score).toBeCloseTo(1 / 61);
  });

  it('returns [] when both channels are empty', () => {
    expect(rrfFuse([], [], 60)).toEqual([]);
  });
});
