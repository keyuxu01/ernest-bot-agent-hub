import {
  AIMessage,
  HumanMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
} from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { isWorkingMessage } from './helpers/chat-memory';

/**
 * 对话短期记忆：Redis 热窗口。
 * Redis miss 或故障时由调用方从 PostgreSQL 回填；只存 human/ai 原文。
 */
@Injectable()
class ChatShortMemoryService {
  private readonly logger = new Logger(ChatShortMemoryService.name);
  private readonly ttlSeconds: number;
  private readonly maxMessages: number;
  private readonly keyPrefix: string;

  /**
   * @description 注入配置和 Redis，读取热窗口 TTL、消息上限与键前缀
   * @param config ConfigService，对话短期记忆配置
   * @param redis RedisService，读写热窗口
   */
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.ttlSeconds = Number(
      config.get('CHAT_SHORT_MEMORY_TTL_SECONDS') ?? 86400,
    );
    this.maxMessages = Number(
      config.get('CHAT_SHORT_MEMORY_MAX_MESSAGES') ?? 20,
    );
    this.keyPrefix =
      config.get<string>('CHAT_SHORT_MEMORY_KEY_PREFIX') ?? 'kh:chat';
  }

  /** Redis/PostgreSQL 工作窗口最多保留的消息数 */
  get windowSize(): number {
    return this.maxMessages;
  }

  /**
   * @description 尝试从 Redis 读取会话工作窗口；key 不存在、格式错误或 Redis 故障时返回 null
   * @param userId string，用户 ID
   * @param sessionId string，会话 ID
   * @returns Promise<BaseMessage[] | null>，命中的 human/ai 消息；miss 时为 null
   */
  async tryLoad(
    userId: string,
    sessionId: string,
  ): Promise<BaseMessage[] | null> {
    try {
      const raw = await this.redis.get(this.key(userId, sessionId));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return mapStoredMessagesToChatMessages(parsed as StoredMessage[]).filter(
        isWorkingMessage,
      );
    } catch (error) {
      this.logger.warn(
        `短期记忆 Redis 读取失败，改走数据库：${toMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * @description 把工作消息裁到窗口上限后写入 Redis，并刷新 TTL
   * @param userId string，用户 ID
   * @param sessionId string，会话 ID
   * @param messages BaseMessage[]，当前工作消息
   * @returns Promise<void>，Redis 失败只记 warn
   */
  async save(
    userId: string,
    sessionId: string,
    messages: BaseMessage[],
  ): Promise<void> {
    const working = messages.filter(isWorkingMessage).slice(-this.maxMessages);
    try {
      const payload = JSON.stringify(mapChatMessagesToStoredMessages(working));
      await this.redis.set(
        this.key(userId, sessionId),
        payload,
        this.ttlSeconds,
      );
    } catch (error) {
      this.logger.warn(`短期记忆 Redis 写入失败：${toMessage(error)}`);
    }
  }

  /**
   * @description 在已有历史后追加一轮用户问题和助手回答并保存热窗口
   * @param userId string，用户 ID
   * @param sessionId string，会话 ID
   * @param history BaseMessage[]，本轮前的工作历史
   * @param question string，用户问题
   * @param answer string，助手回答
   * @returns Promise<void>，保存完成后无返回值
   */
  async appendTurn(
    userId: string,
    sessionId: string,
    history: BaseMessage[],
    question: string,
    answer: string,
  ): Promise<void> {
    await this.save(userId, sessionId, [
      ...history,
      new HumanMessage(question),
      new AIMessage(answer),
    ]);
  }

  /**
   * @description 删除一个用户会话的 Redis 工作窗口
   * @param userId string，用户 ID
   * @param sessionId string，会话 ID
   * @returns Promise<void>，Redis 失败只记 warn
   */
  async clear(userId: string, sessionId: string): Promise<void> {
    try {
      await this.redis.del(this.key(userId, sessionId));
    } catch (error) {
      this.logger.warn(`短期记忆 Redis 删除失败：${toMessage(error)}`);
    }
  }

  /**
   * @description 生成隔离用户和会话的 Redis key
   * @param userId string，用户 ID
   * @param sessionId string，会话 ID
   * @returns string，短期记忆 key
   */
  private key(userId: string, sessionId: string): string {
    return `${this.keyPrefix}:${userId}:${sessionId}:messages`;
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

export { ChatShortMemoryService };
