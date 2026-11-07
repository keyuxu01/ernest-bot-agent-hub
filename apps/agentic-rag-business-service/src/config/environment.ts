type Environment = Record<string, unknown>;

const REQUIRED_ENVIRONMENT_KEYS = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'MONGO_URI',
  'RUSTFS_ENDPOINT',
  'RUSTFS_REGION',
  'RUSTFS_ACCESS_KEY',
  'RUSTFS_SECRET_KEY',
  'RUSTFS_BUCKET',
  'RUSTFS_PUBLIC_URL',
  'RABBITMQ_URL',
  'ELASTICSEARCH_NODE',
  'RAG_CHUNK_SIZE',
  'RAG_CHUNK_OVERLAP',
  'QWEN_LLM_API_KEY',
  'QWEN_CODER_TURBO_MODEL_BASE_URL',
  'EMBEDDINGS_MODEL_NAME',
  'EMBEDDING_DIMENSION',
  'EMBEDDING_BATCH_SIZE',
  // KG 建图：LLM 抽取（与 Embedding 共用 QWEN_LLM_API_KEY / BASE_URL）
  'CHAT_MODEL_NAME',
  'CHAT_MODEL_TIMEOUT_MS',
  // RAG 精排：DashScope text-rerank（复用 QWEN_LLM_API_KEY）
  'QWEN_RERANK_MODEL_NAME',
  'QWEN_RERANK_URL',
  // KG 建图：Neo4j 图存储，启动强依赖
  'NEO4J_URI',
  'NEO4J_USER',
  'NEO4J_PASSWORD',
  // 认证：JWT 签名密钥；JWT_ACCESS_EXPIRES / JWT_REFRESH_EXPIRES 可选，缺省 2h / 7d
  'JWT_SECRET',
] as const;

/** 初始管理员密码最短长度，与注册接口（RegisterDto @MinLength(6)）一致 */
const BOOTSTRAP_ADMIN_PASSWORD_MIN_LENGTH = 6;

const NUMERIC_ENVIRONMENT_KEYS = [
  'POSTGRES_PORT',
  'RAG_CHUNK_SIZE',
  'RAG_CHUNK_OVERLAP',
  'EMBEDDING_DIMENSION',
  'EMBEDDING_BATCH_SIZE',
  'CHAT_MODEL_TIMEOUT_MS',
] as const;

/**
 * 启动前确认基建变量在场；数字项在这里转成 number，布尔开关转成 boolean，业务侧直接取。
 * 协议、URI 格式交给连接失败时排查。
 * @description ConfigModule 的 validate 钩子：校验必填项，转换数字与布尔开关
 * （DOCUMENT_REQUIRE_APPROVAL，缺省 true）
 * @param config Environment，从 .env 文件与进程环境读到的原始键值（都是字符串）
 * @returns Environment，转换后的配置，ConfigService 从这里取值
 * @throws Error 必填项缺失或为空、初始管理员配置不完整、布尔开关不是 true / false
 */
function validateEnvironment(config: Environment): Environment {
  for (const key of REQUIRED_ENVIRONMENT_KEYS) {
    const value = config[key];
    if (value === undefined || value === null) {
      throw new Error(`Environment variable ${key} is required`);
    }
    if (typeof value === 'string' && value.trim() === '') {
      throw new Error(`Environment variable ${key} is required`);
    }
  }

  const normalized: Environment = { ...config };
  for (const key of NUMERIC_ENVIRONMENT_KEYS) {
    normalized[key] = Number(config[key]);
  }
  validateBootstrapAdmin(config);

  // 文档发布审核：可选，默认开启
  normalized.DOCUMENT_REQUIRE_APPROVAL = parseBoolean(
    'DOCUMENT_REQUIRE_APPROVAL',
    config.DOCUMENT_REQUIRE_APPROVAL,
    true,
  );
  return normalized;
}

/**
 * @description 初始管理员（可选）：用户名、密码、邮箱须同时配置，密码不短于注册要求
 * @param config Environment，原始配置
 * @returns void，校验通过时正常返回
 * @throws Error 三项只配了一部分，或密码少于 6 位
 */
function validateBootstrapAdmin(config: Environment): void {
  const username = config.AUTH_BOOTSTRAP_ADMIN_USERNAME;
  const password = config.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  const email = config.AUTH_BOOTSTRAP_ADMIN_EMAIL;
  if (username === undefined && password === undefined && email === undefined) {
    return;
  }
  if (!username || !password || !email) {
    throw new Error(
      'AUTH_BOOTSTRAP_ADMIN_USERNAME, AUTH_BOOTSTRAP_ADMIN_PASSWORD and AUTH_BOOTSTRAP_ADMIN_EMAIL must be set together',
    );
  }
  if (String(password).length < BOOTSTRAP_ADMIN_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Environment variable AUTH_BOOTSTRAP_ADMIN_PASSWORD must be at least ${BOOTSTRAP_ADMIN_PASSWORD_MIN_LENGTH} characters`,
    );
  }
}

/**
 * @description 解析布尔开关：未配置取缺省值；只接受 true / false，其他值直接报错，避免开关静默失效
 * @param key string，变量名（用于报错信息）
 * @param value unknown，原始值
 * @param fallback boolean，未配置时的缺省值
 * @returns boolean，解析结果
 * @throws Error 值不是 'true' / 'false'
 */
function parseBoolean(key: string, value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Environment variable ${key} must be true or false`);
}

export { validateEnvironment };
