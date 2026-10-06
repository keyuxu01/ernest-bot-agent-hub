import { validatePostgresSchemaName } from '../../config/environment';

type PostgresMigrationEnvironment = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  schema: string;
  ssl: boolean;
};

const requireString = (key: string): string => {
  const value = process.env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Environment variable ${key} is required for migrations`);
  }
  return value.trim();
};

const parsePort = (): number => {
  const value = Number(process.env.POSTGRES_PORT ?? 5432);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 65_535) {
    throw new Error('Environment variable POSTGRES_PORT must be a valid port');
  }
  return value;
};

const parseSsl = (): boolean => {
  const value = process.env.POSTGRES_SSL ?? 'false';
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Environment variable POSTGRES_SSL must be true or false');
};

/** 迁移 CLI 只读取 PostgreSQL 所需配置，避免要求 OAuth 等运行时密钥。 */
const readPostgresMigrationEnvironment = (): PostgresMigrationEnvironment => ({
  host: requireString('POSTGRES_HOST'),
  port: parsePort(),
  username: requireString('POSTGRES_USER'),
  password: requireString('POSTGRES_PASSWORD'),
  database: requireString('POSTGRES_DB'),
  schema: validatePostgresSchemaName(process.env.POSTGRES_SCHEMA ?? 'user_platform'),
  ssl: parseSsl(),
});

export type { PostgresMigrationEnvironment };
export { readPostgresMigrationEnvironment };
