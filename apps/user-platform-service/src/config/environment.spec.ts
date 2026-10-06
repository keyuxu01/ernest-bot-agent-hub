import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_PORT,
  validateEnvironment,
} from './environment';

const completeEnvironment: Record<string, unknown> = {
  SERVICE_VERSION: '1.0.0-test',
  SERVICE_BUILD_ID: 'build-test',
  POSTGRES_HOST: 'localhost',
  POSTGRES_USER: 'user',
  POSTGRES_PASSWORD: 'local-password',
  POSTGRES_DB: 'agent_hub',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  OAUTH_ALLOWED_REDIRECT_URIS: 'http://127.0.0.1:49152/callback',
  SIGNING_KEY_ID: 'assistant-signing-test',
  SIGNING_PRIVATE_KEY: 'test-private-key',
  SIGNING_PUBLIC_KEY: 'test-public-key',
  TOKEN_ISSUER: 'https://identity.example.test',
  ENCRYPTION_KEY_ID: 'local-test-key',
  ENCRYPTION_MASTER_KEY: 'test-master-key-material',
};

describe('user platform environment', () => {
  it('normalizes OAuth, persistence and fixed token configuration', () => {
    expect(validateEnvironment(completeEnvironment)).toMatchObject({
      PORT: DEFAULT_PORT,
      ACCESS_TOKEN_TTL_SECONDS,
      TOKEN_ALGORITHM: 'EdDSA',
      TOKEN_AUDIENCE: 'assistant-runtime',
      POSTGRES_SCHEMA: 'user_platform',
    });
  });

  it.each([
    'SERVICE_VERSION',
    'SERVICE_BUILD_ID',
    'POSTGRES_HOST',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'OAUTH_ALLOWED_REDIRECT_URIS',
    'SIGNING_KEY_ID',
    'SIGNING_PRIVATE_KEY',
    'SIGNING_PUBLIC_KEY',
    'TOKEN_ISSUER',
    'ENCRYPTION_KEY_ID',
    'ENCRYPTION_MASTER_KEY',
  ])('rejects a missing required setting %s without exposing values', key => {
    const input = { ...completeEnvironment };
    delete input[key];
    expect(() => validateEnvironment(input)).toThrow(
      `Environment variable ${key} is required`,
    );
  });

  it('rejects a non-loopback OAuth callback', () => {
    expect(() =>
      validateEnvironment({
        ...completeEnvironment,
        OAUTH_ALLOWED_REDIRECT_URIS: 'https://attacker.example/callback',
      }),
    ).toThrow('must contain loopback HTTP URLs only');
  });

  it('rejects a token lifetime above the five-minute revocation bound', () => {
    expect(() =>
      validateEnvironment({
        ...completeEnvironment,
        ACCESS_TOKEN_TTL_SECONDS: 301,
      }),
    ).toThrow('ACCESS_TOKEN_TTL_SECONDS must be exactly 300');
  });

  it('rejects symmetric token algorithms', () => {
    expect(() =>
      validateEnvironment({ ...completeEnvironment, TOKEN_ALGORITHM: 'HS256' }),
    ).toThrow('TOKEN_ALGORITHM must be EdDSA');
  });

  it.each(['Public', 'user-platform', 'unsafe;drop_schema'])(
    'rejects unsafe PostgreSQL schema identifier %s',
    schema => {
      expect(() =>
        validateEnvironment({ ...completeEnvironment, POSTGRES_SCHEMA: schema }),
      ).toThrow('POSTGRES_SCHEMA must be a lowercase PostgreSQL identifier');
    },
  );
});
