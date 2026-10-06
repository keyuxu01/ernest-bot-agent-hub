import { z } from 'zod';

/** Assistant phase 1 使用固定受众与五分钟访问时限。 */
const USER_PLATFORM_ASSISTANT_AUDIENCE = 'assistant-runtime' as const;
const USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS = 300 as const;

const UserPlatformTokenAlgorithmSchema = z.literal('EdDSA');
const UserPlatformKeyIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const UserPlatformSubjectSchema = z.string().min(1).max(256);
const UserPlatformLoopbackRedirectUriSchema = z
  .url({ protocol: /^http$/ })
  .refine(value => {
    const hostname = new URL(value).hostname;
    return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
  }, 'OAuth redirect URI must use an HTTP loopback host');

const UserPlatformAssistantUserSchema = z.object({
  schemaVersion: z.literal(1),
  subject: UserPlatformSubjectSchema,
  normalizedEmail: z.email().transform(value => value.toLowerCase()),
  enabled: z.boolean(),
  resourceVersion: z.int().nonnegative(),
});

/**
 * @description 可公开传输的 JWT 头；这里只定义协议，不负责签名或验签。
 */
const UserPlatformAssistantTokenHeaderSchema = z.object({
  alg: UserPlatformTokenAlgorithmSchema,
  kid: UserPlatformKeyIdSchema,
  typ: z.literal('JWT'),
});

/**
 * @description Runtime 本地验证所需的最小 claims。五分钟时限在契约层固定，
 * 过期与签名判断仍由后续安全适配器使用受控时钟完成。
 */
const UserPlatformAssistantTokenClaimsSchema = z
  .object({
    iss: z.url({ protocol: /^https$/ }),
    aud: z.literal(USER_PLATFORM_ASSISTANT_AUDIENCE),
    sub: UserPlatformSubjectSchema,
    iat: z.int().nonnegative(),
    exp: z.int().positive(),
  })
  .refine(
    ({ exp, iat }) => exp - iat === USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
    'Assistant access token lifetime must be exactly five minutes',
  );

const UserPlatformOAuthAuthorizationRequestSchema = z.object({
  schemaVersion: z.literal(1),
  redirectUri: UserPlatformLoopbackRedirectUriSchema,
  codeChallenge: z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  codeChallengeMethod: z.literal('S256'),
  state: z.string().min(32).max(256),
  nonce: z.string().min(32).max(256),
});

const UserPlatformOAuthCallbackRequestSchema = z.object({
  schemaVersion: z.literal(1),
  code: z.string().min(1).max(4096),
  state: z.string().min(32).max(256),
  codeVerifier: z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9._~-]+$/),
  redirectUri: UserPlatformLoopbackRedirectUriSchema,
});

const UserPlatformAssistantAdmissionSuccessSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal('admitted'),
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresInSeconds: z.literal(USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS),
});

const UserPlatformAssistantAdmissionDeniedSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal('denied'),
  code: z.enum(['IDENTITY_NOT_ALLOWED', 'IDENTITY_DISABLED']),
  message: z.string().min(1).max(256),
});

const UserPlatformAssistantAdmissionResultSchema = z.discriminatedUnion('status', [
  UserPlatformAssistantAdmissionSuccessSchema,
  UserPlatformAssistantAdmissionDeniedSchema,
]);

type UserPlatformAssistantTokenHeader = z.output<
  typeof UserPlatformAssistantTokenHeaderSchema
>;
type UserPlatformAssistantUser = z.output<typeof UserPlatformAssistantUserSchema>;
type UserPlatformAssistantTokenClaims = z.output<
  typeof UserPlatformAssistantTokenClaimsSchema
>;
type UserPlatformOAuthAuthorizationRequest = z.output<
  typeof UserPlatformOAuthAuthorizationRequestSchema
>;
type UserPlatformOAuthCallbackRequest = z.output<
  typeof UserPlatformOAuthCallbackRequestSchema
>;
type UserPlatformAssistantAdmissionResult = z.output<
  typeof UserPlatformAssistantAdmissionResultSchema
>;

/** 由调用方注入受控时钟，避免契约测试依赖真实时间。 */
const parseUserPlatformAssistantTokenClaimsAt = (
  value: unknown,
  nowEpochSeconds: number,
): UserPlatformAssistantTokenClaims => {
  const claims = UserPlatformAssistantTokenClaimsSchema.parse(value);
  if (claims.exp <= nowEpochSeconds) {
    throw new Error('Assistant access token is expired');
  }
  return claims;
};

export type {
  UserPlatformAssistantAdmissionResult,
  UserPlatformAssistantUser,
  UserPlatformAssistantTokenClaims,
  UserPlatformAssistantTokenHeader,
  UserPlatformOAuthAuthorizationRequest,
  UserPlatformOAuthCallbackRequest,
};
export {
  USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
  USER_PLATFORM_ASSISTANT_AUDIENCE,
  UserPlatformAssistantAdmissionDeniedSchema,
  UserPlatformAssistantAdmissionResultSchema,
  UserPlatformAssistantAdmissionSuccessSchema,
  UserPlatformAssistantUserSchema,
  UserPlatformAssistantTokenClaimsSchema,
  UserPlatformAssistantTokenHeaderSchema,
  UserPlatformKeyIdSchema,
  UserPlatformLoopbackRedirectUriSchema,
  UserPlatformOAuthAuthorizationRequestSchema,
  UserPlatformOAuthCallbackRequestSchema,
  UserPlatformSubjectSchema,
  UserPlatformTokenAlgorithmSchema,
  parseUserPlatformAssistantTokenClaimsAt,
};
