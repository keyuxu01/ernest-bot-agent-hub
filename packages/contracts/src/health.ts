import { z } from 'zod';

const HealthIndicatorDetailsSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
);

/**
 * @description Runtime contract for standard liveness and readiness responses.
 */
const HealthProbeResponseSchema = z.object({
  status: z.enum(['ok', 'error', 'shutting_down']),
  info: HealthIndicatorDetailsSchema.optional(),
  error: HealthIndicatorDetailsSchema.optional(),
  details: HealthIndicatorDetailsSchema,
});

/**
 * @description Runtime contract for identifying a running business-service instance without exposing secrets.
 */
const ServiceIdentityResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('agentic-rag-business-service'),
  instanceId: z.string().min(1),
  deploymentId: z.string().min(1).nullable(),
  version: z.string().min(1),
  uptimeSeconds: z.number().int().nonnegative(),
});

/**
 * @description Validated liveness or readiness response inferred from HealthProbeResponseSchema.
 */
type HealthProbeResponse = z.output<typeof HealthProbeResponseSchema>;

/**
 * @description Validated service identity inferred from ServiceIdentityResponseSchema.
 */
type ServiceIdentityResponse = z.output<typeof ServiceIdentityResponseSchema>;

export type { HealthProbeResponse, ServiceIdentityResponse };
export { HealthProbeResponseSchema, ServiceIdentityResponseSchema };
