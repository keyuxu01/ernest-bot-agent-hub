import { describe, expect, it } from 'vitest';
import {
  USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
  UserPlatformAssistantAdmissionResultSchema,
  UserPlatformAssistantTokenClaimsSchema,
  UserPlatformAssistantTokenHeaderSchema,
  UserPlatformAssistantUserSchema,
  UserPlatformOAuthAuthorizationRequestSchema,
  parseUserPlatformAssistantTokenClaimsAt,
} from './access-control';

const issuedAt = 1_800_000_000;

describe('UserPlatform Assistant access contracts', () => {
  it('accepts the fixed asymmetric header and five-minute Runtime claims', () => {
    expect(
      UserPlatformAssistantTokenHeaderSchema.parse({
        alg: 'EdDSA',
        kid: 'assistant-signing-2026-10',
        typ: 'JWT',
      }),
    ).toMatchObject({ alg: 'EdDSA' });

    expect(
      UserPlatformAssistantTokenClaimsSchema.parse({
        iss: 'https://identity.example.test',
        aud: 'assistant-runtime',
        sub: 'google-subject-123',
        iat: issuedAt,
        exp: issuedAt + USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
      }),
    ).toMatchObject({ aud: 'assistant-runtime' });
  });

  it('represents allowlist denial without issuing a token', () => {
    const result = UserPlatformAssistantAdmissionResultSchema.parse({
      schemaVersion: 1,
      status: 'denied',
      code: 'IDENTITY_NOT_ALLOWED',
      message: 'Assistant access is not enabled for this identity',
    });

    expect(result).not.toHaveProperty('accessToken');
  });

  it('represents successful allowlist admission with a five-minute grant', () => {
    expect(
      UserPlatformAssistantAdmissionResultSchema.parse({
        schemaVersion: 1,
        status: 'admitted',
        accessToken: 'signed-test-token',
        tokenType: 'Bearer',
        expiresInSeconds: USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
      }),
    ).toMatchObject({ status: 'admitted', expiresInSeconds: 300 });
  });

  it('normalizes an allowlisted Assistant identity', () => {
    expect(
      UserPlatformAssistantUserSchema.parse({
        schemaVersion: 1,
        subject: 'google-subject-123',
        normalizedEmail: 'USER@EXAMPLE.TEST',
        enabled: true,
        resourceVersion: 1,
      }),
    ).toMatchObject({ normalizedEmail: 'user@example.test', enabled: true });
  });

  it('accepts only loopback OAuth redirects and S256 PKCE', () => {
    const input = {
      schemaVersion: 1,
      redirectUri: 'http://127.0.0.1:49152/callback',
      codeChallenge: 'a'.repeat(43),
      codeChallengeMethod: 'S256',
      state: 's'.repeat(32),
      nonce: 'n'.repeat(32),
    };
    expect(UserPlatformOAuthAuthorizationRequestSchema.parse(input)).toEqual(input);
    expect(() =>
      UserPlatformOAuthAuthorizationRequestSchema.parse({
        ...input,
        redirectUri: 'http://attacker.example/callback',
      }),
    ).toThrow('OAuth redirect URI must use an HTTP loopback host');
  });

  it('rejects a token intended for another audience', () => {
    expect(() =>
      UserPlatformAssistantTokenClaimsSchema.parse({
        iss: 'https://identity.example.test',
        aud: 'another-service',
        sub: 'google-subject-123',
        iat: issuedAt,
        exp: issuedAt + USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
      }),
    ).toThrow();
  });

  it('rejects a lifetime that exceeds the five-minute revocation bound', () => {
    expect(() =>
      UserPlatformAssistantTokenClaimsSchema.parse({
        iss: 'https://identity.example.test',
        aud: 'assistant-runtime',
        sub: 'google-subject-123',
        iat: issuedAt,
        exp: issuedAt + USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS + 1,
      }),
    ).toThrow('Assistant access token lifetime must be exactly five minutes');
  });

  it('rejects an expired token against an injected verification time', () => {
    expect(() =>
      parseUserPlatformAssistantTokenClaimsAt(
        {
          iss: 'https://identity.example.test',
          aud: 'assistant-runtime',
          sub: 'google-subject-123',
          iat: issuedAt,
          exp: issuedAt + USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
        },
        issuedAt + USER_PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
      ),
    ).toThrow('Assistant access token is expired');
  });

  it('does not place credentials in denial or claim contracts', () => {
    expect(UserPlatformAssistantTokenClaimsSchema.keyof().options).not.toContain(
      'accessToken',
    );
    expect(
      UserPlatformAssistantAdmissionResultSchema.parse({
        schemaVersion: 1,
        status: 'denied',
        code: 'IDENTITY_DISABLED',
        message: 'Identity is disabled',
        accessToken: 'must-be-stripped',
      }),
    ).not.toHaveProperty('accessToken');
  });
});
