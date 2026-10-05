import { describe, expect, it } from 'vitest';
import { ragBusinessApiQuery } from './rag-business-api-query';

describe('ragBusinessApiQuery', () => {
  it('derives a stable greeting query key from the contract path', () => {
    const firstKey = ragBusinessApiQuery.greeting.queryKey();
    const secondKey = ragBusinessApiQuery.greeting.queryKey();

    expect(firstKey).toEqual(secondKey);
    expect(firstKey).toEqual([['greeting'], { type: 'query' }]);
  });
});
