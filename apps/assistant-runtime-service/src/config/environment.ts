type Environment = Record<string, unknown>;

const REQUIRED_STRING_KEYS = [
  'SERVICE_VERSION',
  'SERVICE_BUILD_ID',
  'POSTGRES_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'POSTGRES_SCHEMA',
  'REDIS_KEY_PREFIX',
  'MEM0_API_KEY',
  'MEM0_AGENT_ID',
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'ENCRYPTION_KEY_ID',
  'ENCRYPTION_MASTER_KEY',
  'TOKEN_ISSUER',
  'TOKEN_PUBLIC_KEY',
  'TOKEN_KEY_ID',
] as const;

const POSITIVE_INTEGER_KEYS = [
  'PORT',
  'POSTGRES_PORT',
  'POSTGRES_POOL_SIZE',
  'REDIS_HOT_STATE_TTL_SECONDS',
  'REDIS_LEASE_TTL_MS',
  'REDIS_LEASE_RENEW_INTERVAL_MS',
  'REDIS_COMMAND_TIMEOUT_MS',
  'MEM0_TOP_K',
  'MEM0_REQUEST_TIMEOUT_MS',
  'OBJECT_STORAGE_REQUEST_TIMEOUT_MS',
  'MODEL_REQUEST_TIMEOUT_MS',
  'MODEL_MAX_ATTEMPTS',
  'MCP_REQUEST_TIMEOUT_MS',
  'MAX_REQUEST_BYTES',
  'MAX_STREAM_SECONDS',
  'MAX_CONCURRENT_RUNS_PER_USER',
] as const;

const FORBIDDEN_GLOBAL_SCOPE_KEYS = [
  'MEM0_USER_ID',
  'MEM0_SESSION_ID',
  'MEM0_RUN_ID',
] as const;

const DEFAULTS = {
  NODE_ENV: 'development',
  PORT: 9030,
  POSTGRES_PORT: 5432,
  POSTGRES_SCHEMA: 'assistant_runtime',
  POSTGRES_POOL_SIZE: 10,
  POSTGRES_SSL: false,
  REDIS_KEY_PREFIX: 'agent-hub:assistant:v1:',
  REDIS_HOT_STATE_TTL_SECONDS: 1800,
  REDIS_LEASE_TTL_MS: 15_000,
  REDIS_LEASE_RENEW_INTERVAL_MS: 5_000,
  REDIS_COMMAND_TIMEOUT_MS: 5_000,
  MEM0_MODE: 'platform',
  MEM0_AGENT_ID: 'agent-hub-assistant',
  MEM0_TOP_K: 5,
  MEM0_REQUEST_TIMEOUT_MS: 10_000,
  MEM0_EXTRACTION_ENABLED: true,
  OBJECT_STORAGE_REQUEST_TIMEOUT_MS: 10_000,
  MODEL_REQUEST_TIMEOUT_MS: 120_000,
  MODEL_MAX_ATTEMPTS: 3,
  MCP_REQUEST_TIMEOUT_MS: 30_000,
  MAX_REQUEST_BYTES: 1_048_576,
  MAX_STREAM_SECONDS: 300,
  MAX_CONCURRENT_RUNS_PER_USER: 4,
  MAX_MODEL_COST_USD_PER_RUN: 25,
  TOKEN_ALGORITHM: 'EdDSA',
  TOKEN_AUDIENCE: 'assistant-runtime',
} as const;

const POSTGRES_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]*$/;
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

const requireNonBlankString = (config: Environment, key: string): string => {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value.trim();
};

/** 迁移会把 schema 名写入 SQL 标识符，因此只接受无须转义的安全子集。 */
const validatePostgresSchemaName = (value: unknown): string => {
  if (typeof value !== 'string' || !POSTGRES_SCHEMA_PATTERN.test(value)) {
    throw new Error(
      'Environment variable POSTGRES_SCHEMA must be a lowercase PostgreSQL identifier',
    );
  }
  return value;
};

const parsePositiveInteger = (value: unknown, key: string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive integer`);
  }
  return parsed;
};

const parsePositiveNumber = (value: unknown, key: string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive number`);
  }
  return parsed;
};

const parseBoolean = (value: unknown, key: string): boolean => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`Environment variable ${key} must be true or false`);
};

const requireUrl = (
  config: Environment,
  key: string,
  protocols: readonly string[],
): string => {
  const value = requireNonBlankString(config, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Environment variable ${key} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`Environment variable ${key} must use ${protocols.join(' or ')}`);
  }
  return value;
};

/**
 * 仓库内服务在本地开发和测试时直接通过 localhost 通讯，避免为本机联调引入 TLS 证书。
 * 非本地目标以及生产环境仍必须使用 HTTPS，不能借此放开普通明文网络访问。
 */
const requireServiceUrl = (
  config: Environment,
  key: string,
  nodeEnvironment: string,
): string => {
  const value = requireNonBlankString(config, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Environment variable ${key} must be a valid URL`);
  }

  const isLocalDevelopment =
    nodeEnvironment === 'development' || nodeEnvironment === 'test';
  const isLoopbackHttp =
    parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(isLocalDevelopment && isLoopbackHttp)) {
    throw new Error(
      `Environment variable ${key} must use HTTPS, except HTTP localhost in development or test`,
    );
  }
  return value;
};

/**
 * 在进程启动前一次性校验完整依赖契约。错误只包含变量名和约束，绝不回显密钥值。
 * 用户、Session 与 Run 的 Mem0 scope 来自已认证资源，不能做成全局配置。
 */
function validateEnvironment(config: Environment): Environment {
  for (const key of FORBIDDEN_GLOBAL_SCOPE_KEYS) {
    if (config[key] !== undefined) {
      throw new Error(
        `Environment variable ${key} is forbidden; derive memory scope from the authenticated resource`,
      );
    }
  }
  if (config.MEM0_BASE_URL !== undefined) {
    throw new Error(
      'Environment variable MEM0_BASE_URL is unsupported; this release uses managed Mem0 Platform only',
    );
  }

  const normalized: Environment = { ...DEFAULTS, ...config };
  normalized.NODE_ENV = requireNonBlankString(normalized, 'NODE_ENV');
  for (const key of REQUIRED_STRING_KEYS) {
    normalized[key] = requireNonBlankString(normalized, key);
  }
  normalized.POSTGRES_SCHEMA = validatePostgresSchemaName(normalized.POSTGRES_SCHEMA);
  for (const key of POSITIVE_INTEGER_KEYS) {
    normalized[key] = parsePositiveInteger(normalized[key], key);
  }

  normalized.MAX_MODEL_COST_USD_PER_RUN = parsePositiveNumber(
    normalized.MAX_MODEL_COST_USD_PER_RUN,
    'MAX_MODEL_COST_USD_PER_RUN',
  );
  normalized.POSTGRES_SSL = parseBoolean(normalized.POSTGRES_SSL, 'POSTGRES_SSL');
  normalized.MEM0_EXTRACTION_ENABLED = parseBoolean(
    normalized.MEM0_EXTRACTION_ENABLED,
    'MEM0_EXTRACTION_ENABLED',
  );

  normalized.REDIS_URL = requireUrl(normalized, 'REDIS_URL', ['redis:', 'rediss:']);
  normalized.MCP_COLLECTIONS_URL = requireServiceUrl(
    normalized,
    'MCP_COLLECTIONS_URL',
    String(normalized.NODE_ENV),
  );
  normalized.OBJECT_STORAGE_ENDPOINT = requireUrl(normalized, 'OBJECT_STORAGE_ENDPOINT', [
    'http:',
    'https:',
  ]);

  if (normalized.MEM0_MODE !== 'platform') {
    throw new Error(
      'Environment variable MEM0_MODE must be platform; self-hosted Mem0 is outside this release',
    );
  }
  if (normalized.TOKEN_ALGORITHM !== 'EdDSA') {
    throw new Error('Environment variable TOKEN_ALGORITHM must be EdDSA');
  }
  if (normalized.TOKEN_AUDIENCE !== 'assistant-runtime') {
    throw new Error('Environment variable TOKEN_AUDIENCE must be assistant-runtime');
  }
  if (
    Number(normalized.REDIS_LEASE_RENEW_INTERVAL_MS) >=
    Number(normalized.REDIS_LEASE_TTL_MS)
  ) {
    throw new Error(
      'Environment variable REDIS_LEASE_RENEW_INTERVAL_MS must be less than REDIS_LEASE_TTL_MS',
    );
  }

  return normalized;
}

export { validateEnvironment, validatePostgresSchemaName };
