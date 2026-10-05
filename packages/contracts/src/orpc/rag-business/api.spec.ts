import { describe, expect, it } from 'vitest';
import { RagBusinessGreetingResponseSchema } from '../../rag-business/greeting';
import { RagBusinessApiContract, RagBusinessGreetingContract } from './api';

describe('RagBusinessApiContract', () => {
  it('defines the greeting OpenAPI route', () => {
    expect(RagBusinessGreetingContract['~orpc'].route).toMatchObject({
      method: 'GET',
      path: '/api/greeting',
    });
    expect(RagBusinessApiContract.greeting).toBe(RagBusinessGreetingContract);
  });

  it('reuses the prefixed greeting response schema', () => {
    expect(RagBusinessGreetingContract['~orpc'].outputSchema).toBe(
      RagBusinessGreetingResponseSchema,
    );
  });
});
