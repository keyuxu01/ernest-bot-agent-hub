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
 * 首个使用方是 KG 实体关系抽取（迁自 knowledge-hub-backend `bb867d5e` ExtractionService）。
 *
 * 环境变量：
 * - `QWEN_LLM_API_KEY` / `QWEN_CODER_TURBO_MODEL_BASE_URL`（与 Embedding 共用）
 * - `CHAT_MODEL_NAME`：如 qwen-plus
 * - `CHAT_MODEL_TIMEOUT_MS`：qwen-plus + 完整抽取 prompt 常超过 20s，建议 60000
 */
@Injectable()
class ChatModelService {
  readonly model: ChatOpenAI;

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
  }
}

export { ChatModelService };
