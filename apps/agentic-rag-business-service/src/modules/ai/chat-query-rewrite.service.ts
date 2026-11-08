import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import { ChatModelService } from '../../infrastructure/chat-model/chat-model.service';
import { CHAT_QUERY_REWRITE_PROMPT } from './constants/chat-memory.constants';
import { compactRewriteContext } from './helpers/chat-memory';
import { ChatQueryRewriteSchema } from './schemas/chat-query-rewrite.zod';
import type {
  ChatQueryRewriteOutput,
  RetrieveQueryPlan,
} from './type/chat-memory.types';

/** 检索前将依赖上下文的追问改写成独立短查询；失败时回退原问题 */
@Injectable()
class ChatQueryRewriteService {
  private readonly logger = new Logger(ChatQueryRewriteService.name);
  private readonly rewriter: {
    invoke: (messages: unknown[]) => Promise<ChatQueryRewriteOutput>;
  };

  /**
   * @description 使用无思考、低温度模型构造结构化查询改写器
   * @param chatModel ChatModelService，提供 queryRewriteModel
   */
  constructor(chatModel: ChatModelService) {
    this.rewriter = chatModel.queryRewriteModel.withStructuredOutput(
      ChatQueryRewriteSchema,
    ) as typeof this.rewriter;
  }

  /**
   * @description 根据最近对话消解当前问题的指代，并判断是否需要检索知识库
   * @param question string，当前用户问题
   * @param history BaseMessage[]，最近工作消息
   * @returns Promise<RetrieveQueryPlan>，独立检索查询和是否检索；无历史或失败时使用原问题并检索
   */
  async rewrite(
    question: string,
    history: BaseMessage[],
  ): Promise<RetrieveQueryPlan> {
    const fallback: RetrieveQueryPlan = {
      query: question,
      needRetrieve: true,
    };
    if (!history.length) return fallback;
    const context = compactRewriteContext(history);
    if (!context) return fallback;

    try {
      const result = await this.rewriter.invoke([
        new SystemMessage(CHAT_QUERY_REWRITE_PROMPT),
        new HumanMessage(`对话：\n${context}\n\n当前问题：${question}`),
      ]);
      const query = result.standalone_query.trim() || question;
      this.logger.log(
        `检索改写：needRetrieve=${result.need_retrieve}, queryLength=${query.length}`,
      );
      return { query, needRetrieve: result.need_retrieve };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`检索改写失败，使用原问题：${detail}`);
      return fallback;
    }
  }
}

export { ChatQueryRewriteService };
