import { z } from 'zod';

/**
 * @description Validate and normalize the business API origin read from the runtime environment.
 */
const ApiBaseUrlSchema = z.url().transform(value => value.replace(/\/$/, ''));

/**
 * @description Validated business API origin consumed by the oRPC transport.
 */
type ApiBaseUrl = z.output<typeof ApiBaseUrlSchema>;

export type { ApiBaseUrl };
export { ApiBaseUrlSchema };
