import { describe, expect, it } from 'vitest';
import { GreetingResponseSchema } from '../greeting';
import { BusinessApiContract, GreetingContract } from './business-api';

describe('BusinessApiContract', () => {
  it('defines the greeting OpenAPI route', () => {
    expect(GreetingContract['~orpc'].route).toMatchObject({
      method: 'GET',
      path: '/api/greeting',
    });
    expect(BusinessApiContract.greeting).toBe(GreetingContract);
  });

  it('reuses the base greeting response schema', () => {
    expect(GreetingContract['~orpc'].outputSchema).toBe(GreetingResponseSchema);
  });
});
