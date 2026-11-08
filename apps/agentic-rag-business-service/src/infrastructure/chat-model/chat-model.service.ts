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
 * 三个实例：
 * - `model`：KG 实体关系抽取，低温度（0.1）求稳定，超时 `CHAT_MODEL_TIMEOUT_MS`
 * - `answerModel`：非流式 RAG 问答（/ai/chat），温度 0.2，超时 `AI_CHAT_TIMEOUT_MS`（可选，缺省 60000）
 * - `streamAnswerModel`：流式 Agent 问答，关闭 usage 流并开启模型思考
 * - `compactModel`：对话摘要和记忆分类，温度 0，不开启思考
 * - `queryRewriteModel`：检索查询改写，温度 0，超时 `AI_QUERY_REWRITE_TIMEOUT_MS`（缺省 15000）
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
  /** RAG 非流式问答用 */
  readonly answerModel: ChatOpenAI;
  /** RAG 流式 Agent 问答用 */
  readonly streamAnswerModel: ChatOpenAI;
  /** 对话摘要和记忆分类用 */
  readonly compactModel: ChatOpenAI;
  /** 检索查询改写用 */
  readonly queryRewriteModel: ChatOpenAI;

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
    const answerTimeout = Number(config.get('AI_CHAT_TIMEOUT_MS') ?? 60000);
    const rewriteTimeout = Number(
      config.get('AI_QUERY_REWRITE_TIMEOUT_MS') ?? 15000,
    );

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
      timeout: answerTimeout,
      maxRetries: 0,
      useResponsesApi: false,
      configuration: { baseURL: baseUrl },
    });
    this.streamAnswerModel = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0.2,
      timeout: answerTimeout,
      maxRetries: 0,
      useResponsesApi: false,
      // DashScope 流式响应不需要额外 usage 块，避免适配器生成无关事件。
      streamUsage: false,
      configuration: { baseURL: baseUrl },
      // 千问开启思考模式。
      modelKwargs: { enable_thinking: true },
    });
    this.compactModel = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      timeout: answerTimeout,
      maxRetries: 0,
      useResponsesApi: false,
      configuration: { baseURL: baseUrl },
    });
    this.queryRewriteModel = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      timeout: rewriteTimeout,
      maxRetries: 0,
      useResponsesApi: false,
      configuration: { baseURL: baseUrl },
    });
  }
}

export { ChatModelService };
