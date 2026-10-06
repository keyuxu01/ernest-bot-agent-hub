import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

const completeEnvironment: Record<string, unknown> = {
  NODE_ENV: 'development',
  SERVICE_VERSION: '1.0.0-test',
  SERVICE_BUILD_ID: 'build-test',
  MCP_COLLECTIONS_URL: 'http://localhost:9021',
  POSTGRES_HOST: 'localhost',
  POSTGRES_USER: 'user',
  POSTGRES_PASSWORD: 'local-password',
  POSTGRES_DB: 'agent_hub',
  REDIS_URL: 'redis://localhost:6379/0',
  MEM0_MODE: 'platform',
  MEM0_API_KEY: 'mem0-test-key',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_BUCKET: 'assistant-artifacts',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-key',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
  ENCRYPTION_KEY_ID: 'local-test-key',
  ENCRYPTION_MASTER_KEY: 'test-master-key-material',
  TOKEN_ISSUER: 'https://identity.example.test',
  TOKEN_PUBLIC_KEY: 'test-public-key',
  TOKEN_KEY_ID: 'assistant-signing-test',
};

describe('assistant runtime environment', () => {
  it('normalizes the complete managed Platform configuration', () => {
    expect(validateEnvironment(completeEnvironment)).toMatchObject({
      PORT: 9030,
      POSTGRES_PORT: 5432,
      MEM0_MODE: 'platform',
      MEM0_TOP_K: 5,
      TOKEN_ALGORITHM: 'EdDSA',
      TOKEN_AUDIENCE: 'assistant-runtime',
    });
  });

  it.each([
    'SERVICE_VERSION',
    'SERVICE_BUILD_ID',
    'MCP_COLLECTIONS_URL',
    'POSTGRES_HOST',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'REDIS_URL',
    'MEM0_API_KEY',
    'OBJECT_STORAGE_ENDPOINT',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'ENCRYPTION_KEY_ID',
    'ENCRYPTION_MASTER_KEY',
    'TOKEN_ISSUER',
    'TOKEN_PUBLIC_KEY',
    'TOKEN_KEY_ID',
  ])('rejects missing required setting %s without echoing values', key => {
    const input = { ...completeEnvironment };
    delete input[key];
    expect(() => validateEnvironment(input)).toThrow(`Environment variable ${key}`);
  });

  it('rejects the deferred self-hosted Mem0 mode', () => {
    expect(() =>
      validateEnvironment({ ...completeEnvironment, MEM0_MODE: 'self_hosted' }),
    ).toThrow('MEM0_MODE must be platform');
  });

  it('rejects a self-hosted endpoint even when Platform mode is also set', () => {
    expect(() =>
      validateEnvironment({
        ...completeEnvironment,
        MEM0_BASE_URL: 'https://mem0.example.test',
      }),
    ).toThrow('MEM0_BASE_URL is unsupported');
  });

  it('allows the repository MCP service over localhost HTTP in development', () => {
    expect(validateEnvironment(completeEnvironment)).toMatchObject({
      MCP_COLLECTIONS_URL: 'http://localhost:9021',
    });
  });

  it('rejects localhost HTTP for the MCP service boundary in production', () => {
    expect(() =>
      validateEnvironment({
        ...completeEnvironment,
        NODE_ENV: 'production',
        MCP_COLLECTIONS_URL: 'http://localhost:9021',
      }),
    ).toThrow('MCP_COLLECTIONS_URL must use HTTPS');
  });

  it('rejects non-loopback HTTP MCP endpoints in development', () => {
    expect(() =>
      validateEnvironment({
        ...completeEnvironment,
        MCP_COLLECTIONS_URL: 'http://192.168.1.10:9021',
      }),
    ).toThrow('MCP_COLLECTIONS_URL must use HTTPS');
  });

  it('requires lease renewal before lease expiry', () => {
    expect(() =>
      validateEnvironment({
        ...completeEnvironment,
        REDIS_LEASE_TTL_MS: '5000',
        REDIS_LEASE_RENEW_INTERVAL_MS: '5000',
      }),
    ).toThrow('REDIS_LEASE_RENEW_INTERVAL_MS must be less than');
  });

  it.each(['Public', 'assistant-runtime', 'unsafe;drop_schema'])(
    'rejects unsafe PostgreSQL schema identifier %s',
    schema => {
      expect(() =>
        validateEnvironment({ ...completeEnvironment, POSTGRES_SCHEMA: schema }),
      ).toThrow('POSTGRES_SCHEMA must be a lowercase PostgreSQL identifier');
    },
  );

  it.each(['MEM0_USER_ID', 'MEM0_SESSION_ID', 'MEM0_RUN_ID'])(
    'rejects global dynamic memory scope %s',
    key => {
      expect(() =>
        validateEnvironment({ ...completeEnvironment, [key]: 'shared-scope' }),
      ).toThrow(
        `Environment variable ${key} is forbidden; derive memory scope from the authenticated resource`,
      );
    },
  );
});
