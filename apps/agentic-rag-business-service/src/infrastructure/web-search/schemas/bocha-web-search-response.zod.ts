import { z } from 'zod';

/** 博查 Web Search 返回边界，只声明当前消费的字段 */
const BochaWebSearchResponseSchema = z.object({
  code: z.number().optional(),
  msg: z.string().nullish(),
  data: z
    .object({
      webPages: z
        .object({
          value: z
            .array(
              z.object({
                name: z.string().optional(),
                url: z.string().optional(),
                summary: z.string().optional(),
                snippet: z.string().optional(),
                siteName: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export { BochaWebSearchResponseSchema };
