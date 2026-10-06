type CliEnvironmentInput = Record<string, unknown>;

type AssistantCliEnvironment = {
  userPlatformUrl: string;
  assistantRuntimeUrl: string;
  oauthCallbackPort: number;
  credentialService: string;
  credentialAccount: string;
  requestTimeoutMs: number;
  localToolTimeoutMs: number;
  localToolMaxOutputBytes: number;
  version: string;
  buildId: string;
};

const requireString = (input: CliEnvironmentInput, key: string): string => {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value.trim();
};

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** 开发/测试直接连接本仓库 localhost 服务；其他目标和生产环境必须使用 HTTPS。 */
const requireServiceUrl = (input: CliEnvironmentInput, key: string): string => {
  const value = requireString(input, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Environment variable ${key} must be a valid URL`);
  }

  const nodeEnvironment =
    typeof input.NODE_ENV === 'string' && input.NODE_ENV.trim() !== ''
      ? input.NODE_ENV.trim()
      : 'development';
  const isLocalDevelopment =
    nodeEnvironment === 'development' || nodeEnvironment === 'test';
  const isLoopbackHttp =
    parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(isLocalDevelopment && isLoopbackHttp)) {
    throw new Error(
      `Environment variable ${key} must use HTTPS, except HTTP localhost in development or test`,
    );
  }
  return value.replace(/\/$/, '');
};

const requirePositiveInteger = (
  input: CliEnvironmentInput,
  key: string,
  maximum?: number,
): number => {
  const parsed = Number(input[key]);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    throw new Error(`Environment variable ${key} must be a positive integer`);
  }
  return parsed;
};

/** 产品模式的 CLI 配置；诊断命令仍可通过显式 --url 单独探测 Runtime。 */
const validateCliEnvironment = (input: CliEnvironmentInput): AssistantCliEnvironment => ({
  userPlatformUrl: requireServiceUrl(input, 'USER_PLATFORM_URL'),
  assistantRuntimeUrl: requireServiceUrl(input, 'ASSISTANT_RUNTIME_URL'),
  oauthCallbackPort: requirePositiveInteger(input, 'OAUTH_CALLBACK_PORT', 65_535),
  credentialService: requireString(input, 'CREDENTIAL_STORE_SERVICE'),
  credentialAccount: requireString(input, 'CREDENTIAL_STORE_ACCOUNT'),
  requestTimeoutMs: requirePositiveInteger(input, 'CLI_REQUEST_TIMEOUT_MS'),
  localToolTimeoutMs: requirePositiveInteger(input, 'LOCAL_TOOL_TIMEOUT_MS'),
  localToolMaxOutputBytes: requirePositiveInteger(input, 'LOCAL_TOOL_MAX_OUTPUT_BYTES'),
  version: requireString(input, 'CLI_VERSION'),
  buildId: requireString(input, 'CLI_BUILD_ID'),
});

export type { AssistantCliEnvironment };
export { validateCliEnvironment };
