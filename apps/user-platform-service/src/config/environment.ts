type Environment = Record<string, unknown>;

const DEFAULT_PORT = 9040;
const ACCESS_TOKEN_TTL_SECONDS = 300;

const REQUIRED_STRING_KEYS = [
  'SERVICE_VERSION',
  'SERVICE_BUILD_ID',
  'POSTGRES_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'POSTGRES_SCHEMA',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SIGNING_KEY_ID',
  'SIGNING_PRIVATE_KEY',
  'SIGNING_PUBLIC_KEY',
  'TOKEN_ISSUER',
  'ENCRYPTION_KEY_ID',
  'ENCRYPTION_MASTER_KEY',
] as const;

const DEFAULTS = {
  PORT: DEFAULT_PORT,
  POSTGRES_PORT: 5432,
  POSTGRES_SCHEMA: 'user_platform',
  POSTGRES_POOL_SIZE: 5,
  POSTGRES_SSL: false,
  GOOGLE_ISSUER: 'https://accounts.google.com',
  GOOGLE_AUTHORIZATION_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
  GOOGLE_JWKS_URL: 'https://www.googleapis.com/oauth2/v3/certs',
  TOKEN_ALGORITHM: 'EdDSA',
  TOKEN_AUDIENCE: 'assistant-runtime',
  ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_STATE_TTL_SECONDS: 300,
} as const;

const POSTGRES_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]*$/;

const requireString = (config: Environment, key: string): string => {
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

const parseInteger = (value: unknown, key: string, maximum?: number): number => {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    const suffix = maximum === undefined ? '' : ` and at most ${maximum}`;
    throw new Error(`Environment variable ${key} must be a positive integer${suffix}`);
  }
  return parsed;
};

const parseBoolean = (value: unknown, key: string): boolean => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`Environment variable ${key} must be true or false`);
};

const requireHttpsUrl = (config: Environment, key: string): string => {
  const value = requireString(config, key);
  try {
    if (new URL(value).protocol !== 'https:') throw new Error();
  } catch {
    throw new Error(`Environment variable ${key} must be a valid HTTPS URL`);
  }
  return value;
};

const validateLoopbackRedirects = (value: string): string => {
  const redirects = value.split(',').map(item => item.trim());
  if (redirects.length === 0 || redirects.some(item => item === '')) {
    throw new Error('Environment variable OAUTH_ALLOWED_REDIRECT_URIS is required');
  }
  for (const redirect of redirects) {
    let url: URL;
    try {
      url = new URL(redirect);
    } catch {
      throw new Error(
        'Environment variable OAUTH_ALLOWED_REDIRECT_URIS must contain valid URLs',
      );
    }
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    ) {
      throw new Error(
        'Environment variable OAUTH_ALLOWED_REDIRECT_URIS must contain loopback HTTP URLs only',
      );
    }
  }
  return redirects.join(',');
};

/** UserPlatform 启动配置；所有错误均为可操作但不包含密钥值。 */
function validateEnvironment(config: Environment): Environment {
  const normalized: Environment = { ...DEFAULTS, ...config };
  for (const key of REQUIRED_STRING_KEYS) {
    normalized[key] = requireString(normalized, key);
  }
  normalized.POSTGRES_SCHEMA = validatePostgresSchemaName(normalized.POSTGRES_SCHEMA);

  normalized.PORT = parseInteger(normalized.PORT, 'PORT', 65_535);
  normalized.POSTGRES_PORT = parseInteger(
    normalized.POSTGRES_PORT,
    'POSTGRES_PORT',
    65_535,
  );
  normalized.POSTGRES_POOL_SIZE = parseInteger(
    normalized.POSTGRES_POOL_SIZE,
    'POSTGRES_POOL_SIZE',
  );
  normalized.OAUTH_STATE_TTL_SECONDS = parseInteger(
    normalized.OAUTH_STATE_TTL_SECONDS,
    'OAUTH_STATE_TTL_SECONDS',
  );
  normalized.POSTGRES_SSL = parseBoolean(normalized.POSTGRES_SSL, 'POSTGRES_SSL');

  for (const key of [
    'GOOGLE_ISSUER',
    'GOOGLE_AUTHORIZATION_URL',
    'GOOGLE_TOKEN_URL',
    'GOOGLE_JWKS_URL',
    'TOKEN_ISSUER',
  ]) {
    normalized[key] = requireHttpsUrl(normalized, key);
  }
  normalized.OAUTH_ALLOWED_REDIRECT_URIS = validateLoopbackRedirects(
    requireString(normalized, 'OAUTH_ALLOWED_REDIRECT_URIS'),
  );

  if (normalized.TOKEN_ALGORITHM !== 'EdDSA') {
    throw new Error('Environment variable TOKEN_ALGORITHM must be EdDSA');
  }
  if (normalized.TOKEN_AUDIENCE !== 'assistant-runtime') {
    throw new Error('Environment variable TOKEN_AUDIENCE must be assistant-runtime');
  }
  if (Number(normalized.ACCESS_TOKEN_TTL_SECONDS) !== ACCESS_TOKEN_TTL_SECONDS) {
    throw new Error('Environment variable ACCESS_TOKEN_TTL_SECONDS must be exactly 300');
  }
  normalized.ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS;

  return normalized;
}

export {
  ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_PORT,
  validateEnvironment,
  validatePostgresSchemaName,
};
