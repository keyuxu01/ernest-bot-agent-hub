import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatModelService } from '../../infrastructure/chat-model/chat-model.service';
import { Mem0MemoryService } from '../../infrastructure/mem0/mem0-memory.service';
import {
  CHAT_MEMORY_CLASSIFIER_PROMPT,
  CHAT_MEMORY_EXTRACTION_INSTRUCTIONS,
} from './constants/chat-memory.constants';
import { ChatMemoryClassificationSchema } from './schemas/chat-memory-classification.zod';
import type {
  ChatMemoryClassification,
  LongMemoryHits,
} from './type/chat-memory.types';

/**
 * 对话长期记忆：分类并读写 Mem0 用户层和会话层记忆。
 * 记忆只用于改写问题和补充背景，不作为制度事实来源。
 */
@Injectable()
class ChatLongMemoryService {
  private readonly logger = new Logger(ChatLongMemoryService.name);
  private readonly classifier: {
    invoke: (messages: unknown[]) => Promise<ChatMemoryClassification>;
  };
  private readonly topK: number;

  /**
   * @description 注入 Mem0 和无思考分类模型，读取长期记忆返回上限
   * @param config ConfigService，读取 MEM0_TOP_K
   * @param mem0 Mem0MemoryService，可选的 Mem0 Platform 客户端
   * @param chatModel ChatModelService，提供 compactModel 做记忆分类
   */
  constructor(
    config: ConfigService,
    private readonly mem0: Mem0MemoryService,
    chatModel: ChatModelService,
  ) {
    this.topK = Number(config.get('MEM0_TOP_K') ?? 5);
    this.classifier = chatModel.compactModel.withStructuredOutput(
      ChatMemoryClassificationSchema,
    ) as typeof this.classifier;
  }

  /** Mem0 Platform 是否已配置 */
  get enabled(): boolean {
    return this.mem0.enabled;
  }

  /**
   * @description 并行搜索用户层与当前会话层记忆；未配置或失败时返回空结果
   * @param userId string，用户 ID
   * @param sessionId string | undefined，当前会话 ID
   * @param query string，改写后的检索查询
   * @returns Promise<LongMemoryHits>，用户层和会话层记忆文本
   */
  async search(
    userId: string,
    sessionId: string | undefined,
    query: string,
  ): Promise<LongMemoryHits> {
    const empty: LongMemoryHits = { user: [], session: [] };
    if (!this.mem0.enabled) return empty;
    try {
      const [user, session] = await Promise.all([
        this.mem0.search(query, { user_id: userId }, this.topK),
        sessionId
          ? this.mem0.search(
              query,
              { AND: [{ user_id: userId }, { run_id: sessionId }] },
              this.topK,
            )
          : Promise.resolve([]),
      ]);
      return { user, session };
    } catch (error) {
      this.logger.warn(`Mem0 检索失败：${toMessage(error)}`);
      return empty;
    }
  }

  /**
   * @description 把长期记忆组织成系统消息，并声明制度事实仍以本轮检索资料为准
   * @param hits LongMemoryHits，用户层和会话层记忆
   * @returns SystemMessage | null，有记忆时返回系统消息，否则为 null
   */
  buildSystemMessage(hits: LongMemoryHits): SystemMessage | null {
    const blocks: string[] = [];
    if (hits.user.length) {
      blocks.push(
        `【用户长期记忆】\n${hits.user.map((line) => `- ${line}`).join('\n')}`,
      );
    }
    if (hits.session.length) {
      blocks.push(
        `【当前会话记忆】\n${hits.session.map((line) => `- ${line}`).join('\n')}`,
      );
    }
    if (!blocks.length) return null;
    return new SystemMessage(
      `${blocks.join('\n\n')}\n\n以上仅作背景，制度/流程以本轮检索资料为准，不要用记忆替代文档。`,
    );
  }

  /**
   * @description 分类本轮用户原话，将持久偏好写入用户层、当前任务写入会话层；知识库和助手事实不写入
   * @param userId string，用户 ID
   * @param sessionId string，会话 ID
   * @param question string，用户原始问题
   * @param answer string，助手回答，仅用于分类判断
   * @returns Promise<void>，未配置或失败时静默降级并记录 warn
   */
  async rememberTurn(
    userId: string,
    sessionId: string,
    question: string,
    answer: string,
  ): Promise<void> {
    if (!this.mem0.enabled) return;
    try {
      const { write_user, write_session, reason } =
        await this.classifier.invoke([
          new SystemMessage(CHAT_MEMORY_CLASSIFIER_PROMPT),
          new HumanMessage(
            `用户：${question}\n助手（仅供判断，不要当作用户事实）：${answer.slice(0, 300)}`,
          ),
        ]);
      const messages = [{ role: 'user' as const, content: question }];
      const written: string[] = [];
      if (write_user) {
        await this.mem0.add(messages, {
          userId,
          customInstructions: CHAT_MEMORY_EXTRACTION_INSTRUCTIONS,
        });
        written.push('user');
      }
      if (write_session) {
        await this.mem0.add(messages, {
          userId,
          runId: sessionId,
          customInstructions: CHAT_MEMORY_EXTRACTION_INSTRUCTIONS,
        });
        written.push('session');
      }
      this.logger.log(
        `Mem0 分类：${reason}；写入=${written.join(',') || '无'}`,
      );
    } catch (error) {
      this.logger.warn(`Mem0 写入失败：${toMessage(error)}`);
    }
  }

  /**
   * @description 删除指定会话的 Mem0 会话层记忆，保留用户层长期记忆
   * @param userId string，用户 ID
   * @param sessionId string，会话 ID
   * @returns Promise<void>，未配置时直接返回，失败只记 warn
   */
  async clearSession(userId: string, sessionId: string): Promise<void> {
    if (!this.mem0.enabled) return;
    try {
      await this.mem0.clearSession(userId, sessionId);
    } catch (error) {
      this.logger.warn(`Mem0 会话层清理失败：${toMessage(error)}`);
    }
  }
}

/**
 * @description 将未知异常转换为日志文本
 * @param error unknown，捕获的异常
 * @returns string，错误消息
 */
function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { ChatLongMemoryService };
