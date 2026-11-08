import { Injectable, NotFoundException } from '@nestjs/common';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import type {
  CreateSessionDto,
  QuerySessionDto,
  UpdateSessionDto,
} from './dto/session.dto';
import { AiSessionEntity } from './entities/ai-session.entity';
import {
  DEFAULT_CHAT_SESSION_TITLE,
  titleFromQuestion,
} from './helpers/title-from-question';
import { ChatSessionRepository } from './repository/chat-session.repository';
import type { ChatSource } from './type/ai-chat.types';
import { ChatLongMemoryService } from './chat-long-memory.service';
import { ChatShortMemoryService } from './chat-short-memory.service';

/** AI 会话生命周期与问答消息持久化 */
@Injectable()
class ChatSessionService {
  /**
   * @description 注入 AI 会话数据访问层与两级记忆
   * @param sessionRepo ChatSessionRepository，读写 kh_ai_session / kh_ai_message
   * @param shortMemory ChatShortMemoryService，Redis 工作窗口
   * @param longMemory ChatLongMemoryService，Mem0 会话层记忆
   */
  constructor(
    private readonly sessionRepo: ChatSessionRepository,
    private readonly shortMemory: ChatShortMemoryService,
    private readonly longMemory: ChatLongMemoryService,
  ) {}

  /**
   * @description 分页查询当前用户的会话，按最后更新时间倒序
   * @param userId string，当前用户 ID
   * @param query QuerySessionDto，分页参数
   * @returns Promise<{ items: AiSessionEntity[]; total: number; page: number; pageSize: number }>，会话分页
   */
  async pageMine(userId: string, query: QuerySessionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.sessionRepo.findPageByUserId(
      userId,
      page,
      pageSize,
    );
    return { items, total, page, pageSize };
  }

  /**
   * @description 为当前用户新建空会话，空标题使用“新对话”，标题最多保留 80 字
   * @param userId string，当前用户 ID
   * @param dto CreateSessionDto，可选标题
   * @returns Promise<AiSessionEntity>，新建会话
   */
  async create(
    userId: string,
    dto: CreateSessionDto,
  ): Promise<AiSessionEntity> {
    const title = dto.title?.trim() || DEFAULT_CHAT_SESSION_TITLE;
    return this.sessionRepo.createSession({
      id: nextSnowflakeId(),
      userId,
      title: title.slice(0, 80),
    });
  }

  /**
   * @description 重命名当前用户拥有的会话
   * @param userId string，当前用户 ID
   * @param id string，会话 ID
   * @param dto UpdateSessionDto，新标题
   * @returns Promise<AiSessionEntity>，重命名后的会话
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  async rename(
    userId: string,
    id: string,
    dto: UpdateSessionDto,
  ): Promise<AiSessionEntity> {
    const session = await this.getOwned(userId, id);
    session.title = dto.title.trim().slice(0, 80);
    return this.sessionRepo.saveSession(session);
  }

  /**
   * @description 指定会话仍为默认标题时，用首问摘要覆盖；自定义标题保持不变
   * @param userId string，当前用户 ID
   * @param id string，会话 ID
   * @param question string，本次用户问题
   * @returns Promise<AiSessionEntity>，保存后的会话
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  async touchTitle(
    userId: string,
    id: string,
    question: string,
  ): Promise<AiSessionEntity> {
    const session = await this.getOwned(userId, id);
    if (session.title === DEFAULT_CHAT_SESSION_TITLE) {
      session.title = titleFromQuestion(question);
    }
    return this.sessionRepo.saveSession(session);
  }

  /**
   * @description 删除当前用户拥有的会话及全部消息
   * @param userId string，当前用户 ID
   * @param id string，会话 ID
   * @returns Promise<{ message: string }>，固定返回“已删除”
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  async remove(userId: string, id: string): Promise<{ message: string }> {
    await this.getOwned(userId, id);
    await this.sessionRepo.deleteMessages(id);
    await this.sessionRepo.deleteSession(id);
    await this.shortMemory.clear(userId, id);
    await this.longMemory.clearSession(userId, id);
    return { message: '已删除' };
  }

  /**
   * @description 查询当前用户拥有的会话消息
   * @param userId string，当前用户 ID
   * @param sessionId string，会话 ID
   * @returns Promise<AiMessageEntity[]>，按创建时间正序排列的消息
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  async listMessages(userId: string, sessionId: string) {
    await this.getOwned(userId, sessionId);
    return this.sessionRepo.findMessages(sessionId);
  }

  /**
   * @description 查询当前用户会话最近 N 条消息，供 Redis miss 时回填工作窗口
   * @param userId string，当前用户 ID
   * @param sessionId string，会话 ID
   * @param limit number，最多返回条数
   * @returns Promise<AiMessageEntity[]>，按时间正序的最近消息
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  async listRecentMessages(userId: string, sessionId: string, limit: number) {
    await this.getOwned(userId, sessionId);
    return this.sessionRepo.findRecentMessages(sessionId, limit);
  }

  /**
   * @description 保存一轮问答：没有 sessionId 时创建会话，默认标题在首次问答时改为首问摘要
   * @param userId string，当前用户 ID
   * @param sessionId string | undefined，已有会话 ID；不传则新建
   * @param question string，已去除前后空白的用户问题
   * @param answer string，助手回答
   * @param sources ChatSource[]，回答引用资料
   * @returns Promise<AiSessionEntity>，本轮问答所属会话
   * @throws NotFoundException 指定会话不存在或不属于当前用户
   */
  async appendTurn(
    userId: string,
    sessionId: string | undefined,
    question: string,
    answer: string,
    sources: ChatSource[],
  ): Promise<AiSessionEntity> {
    const session = sessionId
      ? await this.getOwned(userId, sessionId)
      : await this.create(userId, { title: titleFromQuestion(question) });

    if (session.title === DEFAULT_CHAT_SESSION_TITLE) {
      session.title = titleFromQuestion(question);
    }
    session.updatedAt = new Date();
    await this.sessionRepo.saveSession(session);

    await this.sessionRepo.saveMessages([
      {
        id: nextSnowflakeId(),
        sessionId: session.id,
        role: 'user',
        content: question,
      },
      {
        id: nextSnowflakeId(),
        sessionId: session.id,
        role: 'assistant',
        content: answer,
        sources: sources.length ? sources : null,
      },
    ]);
    return session;
  }

  /**
   * @description 查询当前用户拥有的会话，隐藏“存在但属于别人”和“不存在”的差异
   * @param userId string，当前用户 ID
   * @param id string，会话 ID
   * @returns Promise<AiSessionEntity>，本人会话
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  private async getOwned(userId: string, id: string): Promise<AiSessionEntity> {
    const session = await this.sessionRepo.findOwned(userId, id);
    if (!session) {
      throw new NotFoundException('会话不存在');
    }
    return session;
  }
}

export { ChatSessionService };
