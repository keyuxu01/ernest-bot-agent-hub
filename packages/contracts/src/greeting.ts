import { z } from 'zod';

/**
 * @description Runtime contract for greeting responses returned by HTTP services.
 */
const GreetingResponseSchema = z.object({
  message: z.string(),
});

/**
 * @description Validated greeting response inferred from GreetingResponseSchema.
 */
type GreetingResponse = z.output<typeof GreetingResponseSchema>;

export type { GreetingResponse };
export { GreetingResponseSchema };
