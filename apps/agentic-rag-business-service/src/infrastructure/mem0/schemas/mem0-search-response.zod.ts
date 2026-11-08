import { z } from 'zod';

/** Mem0 search 返回边界，只消费 memory 文本 */
const Mem0SearchResponseSchema = z.object({
  results: z.array(
    z.object({
      memory: z.string().optional(),
    }),
  ),
});

export { Mem0SearchResponseSchema };
