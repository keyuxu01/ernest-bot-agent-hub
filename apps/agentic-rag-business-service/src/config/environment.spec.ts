import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

const validEnvironment = {
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_USER: 'user',
  POSTGRES_PASSWORD: 'password',
  POSTGRES_DB: 'agent_hub',
  MONGO_URI:
    'mongodb://agent_hub:password@localhost:27017/knowledge_hub?authSource=knowledge_hub',
  RUSTFS_ENDPOINT: 'http://localhost:9000',
  RUSTFS_REGION: 'us-east-1',
  RUSTFS_ACCESS_KEY: 'rustfsadmin',
  RUSTFS_SECRET_KEY: 'rustfsadmin',
  RUSTFS_BUCKET: 'knowledge-hub',
  RUSTFS_PUBLIC_URL: 'http://localhost:9000',
};

describe('validateEnvironment', () => {
  it('normalizes the PostgreSQL port', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      ...validEnvironment,
      POSTGRES_PORT: 5432,
    });
  });

  it('rejects a missing database variable', () => {
    const missingPassword: Record<string, unknown> = { ...validEnvironment };
    delete missingPassword.POSTGRES_PASSWORD;

    expect(() => validateEnvironment(missingPassword)).toThrow(
      'Environment variable POSTGRES_PASSWORD is required',
    );
  });

  it('rejects an invalid PostgreSQL port', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        POSTGRES_PORT: 'not-a-port',
      }),
    ).toThrow(
      'Environment variable POSTGRES_PORT must be an integer between 1 and 65535',
    );
  });

  it('rejects a non-MongoDB URI', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        MONGO_URI: 'https://localhost:27017/knowledge_hub',
      }),
    ).toThrow(
      'Environment variable MONGO_URI must use mongodb:// or mongodb+srv://',
    );
  });

  it('rejects a missing RustFS variable', () => {
    const missingBucket: Record<string, unknown> = { ...validEnvironment };
    delete missingBucket.RUSTFS_BUCKET;

    expect(() => validateEnvironment(missingBucket)).toThrow(
      'Environment variable RUSTFS_BUCKET is required',
    );
  });
});
