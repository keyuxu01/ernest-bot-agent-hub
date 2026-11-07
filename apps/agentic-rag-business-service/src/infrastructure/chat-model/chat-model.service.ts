import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

/**
 * 对话模型客户端（通义千问 / DashScope OpenAI 兼容接口）
 *
 * 与 EmbeddingService 同理（ADR-0017）：LangChain `ChatOpenAI` 只是客户端，
 * 实际模型是千问；厂商 SDK 构造集中在 infrastructure，业务侧只拿配置好的实例，
 * 自己决定 prompt 与结构化输出 schema。
 *
 * 两个实例：
 * - `model`：KG 实体关系抽取，低温度（0.1）求稳定，超时 `CHAT_MODEL_TIMEOUT_MS`
 * - `answerModel`：RAG 问答（/ai/chat），温度 0.2，超时 `AI_CHAT_TIMEOUT_MS`（可选，缺省 60000）
 *
 * 环境变量：
 * - `QWEN_LLM_API_KEY` / `QWEN_CODER_TURBO_MODEL_BASE_URL`（与 Embedding 共用）
 * - `CHAT_MODEL_NAME`：如 qwen-plus
 * - `CHAT_MODEL_TIMEOUT_MS`：qwen-plus + 完整抽取 prompt 常超过 20s，建议 120000
 */
@Injectable()
class ChatModelService {
  /** KG 抽取用 */
  readonly model: ChatOpenAI;
  /** RAG 问答用 */
  readonly answerModel: ChatOpenAI;

  /**
   * @description 按环境变量构造抽取与问答两个千问客户端
   * @param config ConfigService，环境变量
   */
  constructor(config: ConfigService) {
    const apiKey = config.getOrThrow<string>('QWEN_LLM_API_KEY');
    const baseUrl = config.getOrThrow<string>(
      'QWEN_CODER_TURBO_MODEL_BASE_URL',
    );
    const model = config.getOrThrow<string>('CHAT_MODEL_NAME');
    const timeout = config.getOrThrow<number>('CHAT_MODEL_TIMEOUT_MS');

    this.model = new ChatOpenAI({
      apiKey,
      model,
      // 抽取类任务要稳定可复现，低温度
      temperature: 0.1,
      timeout,
      // 超时后不在 SDK 内重试：一次抽取已很慢，重试会把单条 MQ 消息拖到数分钟
      maxRetries: 0,
      // DashScope 只兼容 Chat Completions，不能切到 OpenAI Responses API
      useResponsesApi: false,
      configuration: { baseURL: baseUrl },
    });
    this.answerModel = new ChatOpenAI({
      apiKey,
      model,
      // 问答允许少量表述变化
      temperature: 0.2,
      timeout: Number(config.get('AI_CHAT_TIMEOUT_MS') ?? 60000),
      maxRetries: 0,
      useResponsesApi: false,
      configuration: { baseURL: baseUrl },
    });
  }
}

export { ChatModelService };
