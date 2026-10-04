import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';

/**
 * 文本向量化（通义千问 / DashScope OpenAI 兼容接口）
 *
 * LangChain `OpenAIEmbeddings` 只是客户端；实际模型是千问 Embedding。
 * `apiKey` / `model` / 维度 / 批次从环境变量读取，调用方只传文本。
 *
 * 环境变量：
 * - `QWEN_LLM_API_KEY`
 * - `QWEN_CODER_TURBO_MODEL_BASE_URL`
 * - `EMBEDDINGS_MODEL_NAME` / `EMBEDDING_DIMENSION` / `EMBEDDING_BATCH_SIZE`
 */
@Injectable()
class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly embeddings: OpenAIEmbeddings;

  constructor(config: ConfigService) {
    const dimension = config.getOrThrow<number>('EMBEDDING_DIMENSION');
    const batchSize = config.getOrThrow<number>('EMBEDDING_BATCH_SIZE');
    const apiKey = config.getOrThrow<string>('QWEN_LLM_API_KEY');
    const baseUrl = config.getOrThrow<string>(
      'QWEN_CODER_TURBO_MODEL_BASE_URL',
    );
    const model = config.getOrThrow<string>('EMBEDDINGS_MODEL_NAME');

    this.embeddings = new OpenAIEmbeddings({
      apiKey,
      model,
      dimensions: dimension,
      batchSize,
      // Markdown chunk 保留换行，避免语义被过度压扁
      stripNewLines: false,
      configuration: {
        baseURL: baseUrl,
      },
    });
  }

  /** 单条嵌入 */
  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    if (!vec) {
      throw new Error('Embedding 返回空向量');
    }
    return vec;
  }

  /** 批量嵌入（内部按 batchSize 切片） */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    const vectors = await this.embeddings.embedDocuments(texts);
    this.logger.debug(`嵌入完成：count=${vectors.length}`);
    return vectors;
  }
}

export { EmbeddingService };
