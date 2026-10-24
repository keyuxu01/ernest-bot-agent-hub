import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatModelService } from '../../infrastructure/chat-model/chat-model.service';
import { KG_EXTRACTION_OUTPUT_NAME } from './constants/kg-extraction.constants';
import {
  buildKgExtractionSystemPrompt,
  buildKgExtractionUserPrompt,
} from './helpers/build-kg-extraction-prompt';
import { toKgExtractionResult } from './helpers/normalize-kg-extraction';
import { KgExtractionLlmOutputSchema } from './schemas/kg-extraction.zod';
import type { KgExtractionResult } from './type/kg-extraction.types';

/**
 * KG 实体 / 关系抽取
 *
 * 迁自 knowledge-hub-backend `bb867d5e` ExtractionService：
 * 对每个块调用 `ChatOpenAI.withStructuredOutput`（不指定 method，qwen-plus 默认 jsonSchema），
 * 再经 normalize helper 归类、截断、丢弃悬空关系。
 *
 * 与源实现的差异：
 * - 模型客户端由 infrastructure/chat-model 构造，本类只管 prompt 与 schema
 * - 不再兼容 OPENAI_API_KEY / LLM_API_KEY / DASHSCOPE_API_KEY 多套变量，
 *   统一用启动时已校验的 QWEN_LLM_API_KEY，缺失直接阻断启动而不是运行时才报错
 *
 * 失败（超时、结构化解析失败）直接抛出，由 GraphBuildService 决定是否跳过该块。
 */
@Injectable()
class KgExtractionService {
  private readonly logger = new Logger(KgExtractionService.name);
  private readonly structuredModel;

  constructor(chatModel: ChatModelService) {
    this.structuredModel = chatModel.model.withStructuredOutput(
      KgExtractionLlmOutputSchema,
      { name: KG_EXTRACTION_OUTPUT_NAME },
    );
  }

  /**
   * 对单个块做抽取。
   * @param content 块正文
   * @param heading 所属章节标题（给 LLM 当上下文）
   * @param documentTitle 文档标题
   */
  async extract(
    content: string,
    heading: string | null | undefined,
    documentTitle: string,
  ): Promise<KgExtractionResult> {
    if (!content?.trim()) {
      return { entities: [], relations: [] };
    }

    const started = Date.now();
    const parsed = await this.structuredModel.invoke([
      new SystemMessage(buildKgExtractionSystemPrompt()),
      new HumanMessage(
        buildKgExtractionUserPrompt({ documentTitle, heading, content }),
      ),
    ]);
    const result = toKgExtractionResult(parsed);
    // 只记耗时与计数，不记正文
    this.logger.log(
      `KG 抽取完成：elapsed=${Date.now() - started}ms, chars=${content.length}, entities=${result.entities.length}, relations=${result.relations.length}`,
    );
    return result;
  }
}

export { KgExtractionService };
