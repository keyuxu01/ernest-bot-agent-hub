import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatModelService } from '../../infrastructure/chat-model/chat-model.service';
import { RAG_ANSWER_SYSTEM_PROMPT } from './constants/ai-chat.constants';
import { buildContext, toCitedSources } from './helpers/rag-answer';
import { HybridRetrievalService } from './hybrid-retrieval.service';
import type { ChatResult } from './type/ai-chat.types';

/**
 * RAG 对话：kh_chunk 混合检索（关键词 + 向量 + RRF + rerank）→ LLM 只按资料作答并标注 [n] → 返回引用到的溯源
 *
 * LLM 用 ChatModelService.answerModel（千问，温度 0.2）。日志只记数量与长度，不记问题与回答原文。
 */
@Injectable()
class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  /**
   * @description 注入对话模型与混合检索
   * @param chatModel ChatModelService，取 answerModel 生成回答
   * @param retrieval HybridRetrievalService，召回资料
   */
  constructor(
    private readonly chatModel: ChatModelService,
    private readonly retrieval: HybridRetrievalService,
  ) {}

  /**
   * @description 检索 topK 块后让 LLM 作答；问题为空或没有命中时直接返回提示，不调 LLM。LLM 调用失败向上抛（500）
   * @param question string，用户问题
   * @param topK number，召回块数，默认 5
   * @returns Promise<ChatResult>，answer 为回答，sources 为回答里实际引用的资料（没有引用编号时为全部召回）
   */
  async chat(question: string, topK = 5): Promise<ChatResult> {
    const trimmed = question.trim();
    if (!trimmed) {
      return { answer: '请输入问题。', sources: [] };
    }

    // ① 混合检索
    const hits = await this.retrieval.retrieve(trimmed, topK);
    if (!hits.length) {
      return { answer: '知识库里没有相关内容。', sources: [] };
    }

    // ② 资料编号拼进 prompt
    const context = buildContext(hits);
    // ③ 调千问：系统消息约束「只按资料答、标注编号」，用户消息放资料与问题
    const response = await this.chatModel.answerModel.invoke([
      new SystemMessage(RAG_ANSWER_SYSTEM_PROMPT),
      new HumanMessage(`检索到的资料：\n${context}\n\n用户问题：${trimmed}`),
    ]);

    // content 一般是字符串；多模态分段时转成 JSON 文本
    const answer =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    // ④ 从回答解析 [n]，返回引用到的资料
    const sources = toCitedSources(answer, hits);
    this.logger.log(
      `RAG 对话完成：hits=${hits.length}, cited=${sources.length}, answerLength=${answer.length}`,
    );
    return { answer, sources };
  }
}

export { AiChatService };
