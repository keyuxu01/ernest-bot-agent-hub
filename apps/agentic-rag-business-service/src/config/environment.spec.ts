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
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  ELASTICSEARCH_NODE: 'http://localhost:9200',
  RAG_CHUNK_SIZE: '512',
  RAG_CHUNK_OVERLAP: '64',
  QWEN_LLM_API_KEY: 'sk-test',
  QWEN_CODER_TURBO_MODEL_BASE_URL:
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  EMBEDDINGS_MODEL_NAME: 'text-embedding-v4',
  EMBEDDING_DIMENSION: '1024',
  EMBEDDING_BATCH_SIZE: '10',
  CHAT_MODEL_NAME: 'qwen-plus',
  CHAT_MODEL_TIMEOUT_MS: '60000',
  NEO4J_URI: 'bolt://localhost:7687',
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: 'password',
};

describe('validateEnvironment', () => {
  it('returns the config and coerces numeric keys', () => {
    expect(validateEnvironment(validEnvironment)).toEqual({
      ...validEnvironment,
      POSTGRES_PORT: 5432,
      RAG_CHUNK_SIZE: 512,
      RAG_CHUNK_OVERLAP: 64,
      EMBEDDING_DIMENSION: 1024,
      EMBEDDING_BATCH_SIZE: 10,
      CHAT_MODEL_TIMEOUT_MS: 60000,
    });
  });

  it('rejects a missing required variable', () => {
    const missingPassword: Record<string, unknown> = { ...validEnvironment };
    delete missingPassword.POSTGRES_PASSWORD;

    expect(() => validateEnvironment(missingPassword)).toThrow(
      'Environment variable POSTGRES_PASSWORD is required',
    );
  });

  it('rejects a missing Neo4j connection variable', () => {
    const missingNeo4j: Record<string, unknown> = { ...validEnvironment };
    delete missingNeo4j.NEO4J_URI;
    expect(() => validateEnvironment(missingNeo4j)).toThrow(
      'Environment variable NEO4J_URI is required',
    );
  });

  it('rejects a blank required variable', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        QWEN_LLM_API_KEY: '   ',
      }),
    ).toThrow('Environment variable QWEN_LLM_API_KEY is required');
  });
});
