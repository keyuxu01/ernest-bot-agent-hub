import type { ChunkHit } from '../type/chunk-hit.types';

/**
 * @description Reciprocal Rank Fusion（倒数排名融合）：score(d) = Σ 1 / (C + rank_r(d))。
 * 两路各自按原始得分降序排名后再算；同一 chunkId 在两路都出现时得分相加，
 * 所以两路都靠前的块排最前。只看排名，不看原始分的量纲（BM25 与余弦分不可直接比较）。
 * @param keywordHits ChunkHit[]，关键词（BM25）召回结果
 * @param vectorHits ChunkHit[]，向量（kNN）召回结果
 * @param rrfC number，平滑常数 C，越大则排名差距对得分的影响越小
 * @returns ChunkHit[]，按 RRF 分降序的去重结果；score 为 RRF 分，bm25Score / vectorScore 记录两路原始分
 */
function rrfFuse(
  keywordHits: ChunkHit[],
  vectorHits: ChunkHit[],
  rrfC: number,
): ChunkHit[] {
  // chunkId → 融合后的命中
  const fused = new Map<string, ChunkHit>();
  /**
   * @description 把一路召回结果按排名累加进 fused
   * @param hits ChunkHit[]，这一路的命中
   * @param channel 'keyword' | 'vector'，是哪一路，决定原始分记到 bm25Score 还是 vectorScore
   * @returns void
   */
  const addChannel = (hits: ChunkHit[], channel: 'keyword' | 'vector') => {
    // 按这一路的原始分降序排名（不改原数组）
    const sorted = [...hits].sort((a, b) => b.score - a.score);
    sorted.forEach((hit, rank) => {
      // rank 从 0 开始，公式里的排名从 1 开始
      const rrf = 1 / (rrfC + rank + 1);
      const existing = fused.get(hit.chunkId);
      // 第一次出现：RRF 分即本路贡献，另一路原始分先记 0
      if (!existing) {
        fused.set(hit.chunkId, {
          ...hit,
          score: rrf,
          bm25Score: channel === 'keyword' ? hit.score : 0,
          vectorScore: channel === 'vector' ? hit.score : 0,
        });
        return;
      }
      // 另一路也召回了它：RRF 分相加，补上本路原始分
      existing.score += rrf;
      if (channel === 'keyword') existing.bm25Score = hit.score;
      if (channel === 'vector') existing.vectorScore = hit.score;
    });
  };

  addChannel(keywordHits, 'keyword');
  addChannel(vectorHits, 'vector');

  // 按融合分降序
  return [...fused.values()].sort((a, b) => b.score - a.score);
}

export { rrfFuse };
