import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import { ChatModelService } from '../../infrastructure/chat-model/chat-model.service';
import type { AuthUser } from '../user/type/user.types';
import { ChatSessionService } from './chat-session.service';
import { RAG_ANSWER_SYSTEM_PROMPT } from './constants/ai-chat.constants';
import { buildContext, toCitedSources } from './helpers/rag-answer';
import { HybridRetrievalService } from './hybrid-retrieval.service';
import type { ChatResult, ChatSource } from './type/ai-chat.types';

/**
 * RAG 对话：kh_chunk 混合检索（关键词 + 向量 + RRF + rerank）→ LLM 只按资料作答并标注 [n] → 返回引用到的溯源。
 * 登录用户的一轮问答会写入本人 AI 会话；日志只记数量与长度，不记问题与回答原文。
 */
@Injectable()
class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  /**
   * @description 注入对话模型、混合检索与会话服务
   * @param chatModel ChatModelService，取 answerModel 生成回答
   * @param retrieval HybridRetrievalService，召回资料
   * @param sessions ChatSessionService，保存用户会话和问答消息
   */
  constructor(
    private readonly chatModel: ChatModelService,
    private readonly retrieval: HybridRetrievalService,
    private readonly sessions: ChatSessionService,
  ) {}

  /**
   * @description 检索 topK 块后让 LLM 作答；空问题不落库；没有命中时保存提示回答；LLM 调用失败向上抛且不落库
   * @param question string，用户问题
   * @param topK number，召回块数，默认 5
   * @param user AuthUser | undefined，当前登录用户；内部无用户调用时不保存会话
   * @param sessionId string | undefined，已有会话 ID；不传时为登录用户新建会话
   * @returns Promise<ChatResult>，sessionId、回答和实际引用资料
   * @throws NotFoundException 指定会话不存在或不属于当前用户
   */
  async chat(
    question: string,
    topK = 5,
    user?: AuthUser,
    sessionId?: string,
  ): Promise<ChatResult> {
    const trimmed = question.trim();
    if (!trimmed) {
      return {
        sessionId: sessionId ?? null,
        answer: '请输入问题。',
        sources: [],
      };
    }

    // ① 混合检索
    const hits = await this.retrieval.retrieve(trimmed, topK);
    if (!hits.length) {
      const empty = {
        answer: '知识库里没有相关内容。',
        sources: [] as ChatSource[],
      };
      const session = user
        ? await this.sessions.appendTurn(
            user.userId,
            sessionId,
            trimmed,
            empty.answer,
            empty.sources,
          )
        : null;
      return { sessionId: session?.id ?? sessionId ?? null, ...empty };
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

    const session = user
      ? await this.sessions.appendTurn(
          user.userId,
          sessionId,
          trimmed,
          answer,
          sources,
        )
      : null;

    return { sessionId: session?.id ?? sessionId ?? null, answer, sources };
  }
}

export { AiChatService };
