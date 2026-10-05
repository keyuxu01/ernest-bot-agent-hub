import { z } from 'zod';

const SharedHealthIndicatorDetailsSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
);

/**
 * @description Cross-service liveness / readiness probe body.
 */
const SharedHealthProbeResponseSchema = z.object({
  status: z.enum(['ok', 'error', 'shutting_down']),
  info: SharedHealthIndicatorDetailsSchema.optional(),
  error: SharedHealthIndicatorDetailsSchema.optional(),
  details: SharedHealthIndicatorDetailsSchema,
});

const SharedKnownServiceNameSchema = z.enum([
  'agentic-rag-business-service',
  'mcp-app-collections',
]);

/**
 * @description Cross-service identity probe without secrets.
 */
const SharedServiceIdentityResponseSchema = z.object({
  status: z.literal('ok'),
  service: SharedKnownServiceNameSchema,
  instanceId: z.string().min(1),
  deploymentId: z.string().min(1).nullable(),
  version: z.string().min(1),
  uptimeSeconds: z.number().int().nonnegative(),
});

type SharedHealthProbeResponse = z.output<typeof SharedHealthProbeResponseSchema>;
type SharedKnownServiceName = z.output<typeof SharedKnownServiceNameSchema>;
type SharedServiceIdentityResponse = z.output<
  typeof SharedServiceIdentityResponseSchema
>;

export type {
  SharedHealthProbeResponse,
  SharedKnownServiceName,
  SharedServiceIdentityResponse,
};
export {
  SharedHealthProbeResponseSchema,
  SharedKnownServiceNameSchema,
  SharedServiceIdentityResponseSchema,
};
