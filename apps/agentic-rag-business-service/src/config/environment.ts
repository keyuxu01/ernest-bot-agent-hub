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
] as const;

const NUMERIC_ENVIRONMENT_KEYS = [
  'POSTGRES_PORT',
  'RAG_CHUNK_SIZE',
  'RAG_CHUNK_OVERLAP',
  'EMBEDDING_DIMENSION',
  'EMBEDDING_BATCH_SIZE',
] as const;

/**
 * 启动前确认基建变量在场；数字项在这里转成 number，业务侧直接取。
 * 协议、URI 格式交给连接失败时排查。
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

  return normalized;
}

export { validateEnvironment };
