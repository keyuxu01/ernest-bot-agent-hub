import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import { ChatModelService } from '../../infrastructure/chat-model/chat-model.service';
import type { ChunkHit } from '../../infrastructure/elasticsearch/type/chunk-hit.types';
import type { AuthUser } from '../user/type/user.types';
import { ChatLongMemoryService } from './chat-long-memory.service';
import { ChatQueryRewriteService } from './chat-query-rewrite.service';
import { ChatSessionService } from './chat-session.service';
import { ChatShortMemoryService } from './chat-short-memory.service';
import { RAG_ANSWER_SYSTEM_PROMPT } from './constants/ai-chat.constants';
import { dbRowsToMessages } from './helpers/chat-memory';
import { buildContext, toCitedSources } from './helpers/rag-answer';
import { HybridRetrievalService } from './hybrid-retrieval.service';
import type { ChatResult, ChatSource } from './type/ai-chat.types';

/**
 * 非流式 RAG 对话：加载短期/长期记忆 → 改写检索问题 → 检索 → 携带历史和记忆作答 → 持久化。
 * 制度事实仍以本轮检索资料为准；日志不记录问题、回答或记忆原文。
 */
@Injectable()
class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  /**
   * @description 注入模型、检索、会话、两级记忆和查询改写服务
   * @param chatModel ChatModelService，提供非流式回答模型
   * @param retrieval HybridRetrievalService，按改写后的问题召回资料
   * @param sessions ChatSessionService，保存会话和问答消息
   * @param shortMemory ChatShortMemoryService，Redis 工作窗口
   * @param longMemory ChatLongMemoryService，Mem0 用户层/会话层记忆
   * @param queryRewrite ChatQueryRewriteService，消解追问指代并判断是否检索
   */
  constructor(
    private readonly chatModel: ChatModelService,
    private readonly retrieval: HybridRetrievalService,
    private readonly sessions: ChatSessionService,
    private readonly shortMemory: ChatShortMemoryService,
    private readonly longMemory: ChatLongMemoryService,
    private readonly queryRewrite: ChatQueryRewriteService,
  ) {}

  /**
   * @description 使用会话历史改写问题、检索可见资料并回答；空问题不落库，检索失败和长期记忆失败按源逻辑降级
   * @param question string，用户问题
   * @param topK number，召回块数，默认 5
   * @param user AuthUser | undefined，当前登录用户；内部无用户调用时不保存会话和记忆
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

    const history = user
      ? await this.loadWorkingHistory(user.userId, sessionId)
      : [];
    const plan = await this.queryRewrite.rewrite(trimmed, history);
    const [hits, memoryHits] = await Promise.all([
      plan.needRetrieve
        ? this.retrieval.retrieve(plan.query, topK, user)
        : Promise.resolve([] as ChunkHit[]),
      user
        ? this.longMemory.search(user.userId, sessionId, plan.query)
        : Promise.resolve({ user: [], session: [] }),
    ]);

    if (plan.needRetrieve && !hits.length) {
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
      if (user && session) {
        await this.shortMemory.appendTurn(
          user.userId,
          session.id,
          history,
          trimmed,
          empty.answer,
        );
        void this.longMemory.rememberTurn(
          user.userId,
          session.id,
          trimmed,
          empty.answer,
        );
      }
      return { sessionId: session?.id ?? sessionId ?? null, ...empty };
    }

    const memoryMessage = this.longMemory.buildSystemMessage(memoryHits);
    const userTurn = hits.length
      ? `检索到的资料：\n${buildContext(hits)}\n\n用户问题：${trimmed}`
      : `用户问题：${trimmed}`;
    const response = await this.chatModel.answerModel.invoke([
      new SystemMessage(RAG_ANSWER_SYSTEM_PROMPT),
      ...(memoryMessage ? [memoryMessage] : []),
      ...history,
      new HumanMessage(userTurn),
    ]);

    const answer =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
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
    if (user && session) {
      await this.shortMemory.appendTurn(
        user.userId,
        session.id,
        history,
        trimmed,
        answer,
      );
      void this.longMemory.rememberTurn(
        user.userId,
        session.id,
        trimmed,
        answer,
      );
    }

    return { sessionId: session?.id ?? sessionId ?? null, answer, sources };
  }

  /**
   * @description 加载会话工作窗口：优先 Redis，miss 时从 PostgreSQL 最近消息回填
   * @param userId string，用户 ID
   * @param sessionId string | undefined，会话 ID；不传时没有历史
   * @returns Promise<BaseMessage[]>，按时间正序的 human/ai 工作消息
   * @throws NotFoundException 指定会话不存在或不属于当前用户
   */
  private async loadWorkingHistory(
    userId: string,
    sessionId: string | undefined,
  ): Promise<BaseMessage[]> {
    if (!sessionId) return [];
    const cached = await this.shortMemory.tryLoad(userId, sessionId);
    if (cached) return cached;
    const rows = await this.sessions.listRecentMessages(
      userId,
      sessionId,
      this.shortMemory.windowSize,
    );
    const history = dbRowsToMessages(rows);
    if (history.length) {
      await this.shortMemory.save(userId, sessionId, history);
    }
    return history;
  }
}

export { AiChatService };
