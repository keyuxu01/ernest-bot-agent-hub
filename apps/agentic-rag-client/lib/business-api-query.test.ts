import { describe, expect, it } from 'vitest';
import { businessApiQuery } from './business-api-query';

describe('businessApiQuery', () => {
  it('derives a stable greeting query key from the contract path', () => {
    const firstKey = businessApiQuery.greeting.queryKey();
    const secondKey = businessApiQuery.greeting.queryKey();

    expect(firstKey).toEqual(secondKey);
    expect(firstKey).toEqual([['greeting'], { type: 'query' }]);
  });
});
