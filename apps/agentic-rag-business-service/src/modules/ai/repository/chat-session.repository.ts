import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiMessageEntity } from '../entities/ai-message.entity';
import { AiSessionEntity } from '../entities/ai-session.entity';

/** PostgreSQL `kh_ai_session` / `kh_ai_message` 数据访问 */
@Injectable()
class ChatSessionRepository {
  /**
   * @description 注入 AI 会话与消息的 TypeORM Repository
   * @param sessionRepo Repository<AiSessionEntity>，操作 kh_ai_session
   * @param messageRepo Repository<AiMessageEntity>，操作 kh_ai_message
   */
  constructor(
    @InjectRepository(AiSessionEntity)
    private readonly sessionRepo: Repository<AiSessionEntity>,
    @InjectRepository(AiMessageEntity)
    private readonly messageRepo: Repository<AiMessageEntity>,
  ) {}

  /**
   * @description 分页查询指定用户的会话，按最后更新时间倒序
   * @param userId string，会话所属用户 ID
   * @param page number，页码，从 1 开始
   * @param pageSize number，每页条数
   * @returns Promise<[AiSessionEntity[], number]>，当前页会话与总数
   */
  async findPageByUserId(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<[AiSessionEntity[], number]> {
    // SQL：SELECT * FROM kh_ai_session WHERE user_id = :userId
    // ORDER BY updated_at DESC OFFSET :skip LIMIT :pageSize，并同时执行 COUNT(*)。
    return this.sessionRepo.findAndCount({
      where: { userId },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  /**
   * @description 创建会话实体并写入数据库
   * @param input Partial<AiSessionEntity>，会话 ID、用户 ID 与标题
   * @returns Promise<AiSessionEntity>，落库后的会话
   */
  async createSession(
    input: Partial<AiSessionEntity>,
  ): Promise<AiSessionEntity> {
    // SQL：INSERT INTO kh_ai_session (id, user_id, title) VALUES (...) RETURNING *。
    return this.sessionRepo.save(this.sessionRepo.create(input));
  }

  /**
   * @description 保存会话标题或更新时间
   * @param session AiSessionEntity，要更新的会话
   * @returns Promise<AiSessionEntity>，更新后的会话
   */
  async saveSession(session: AiSessionEntity): Promise<AiSessionEntity> {
    // SQL：UPDATE kh_ai_session SET title = :title, updated_at = :updatedAt WHERE id = :id。
    return this.sessionRepo.save(session);
  }

  /**
   * @description 按用户和会话 ID 查询本人会话
   * @param userId string，当前用户 ID
   * @param id string，会话 ID
   * @returns Promise<AiSessionEntity | null>，本人会话；不存在或不属于本人时为 null
   */
  async findOwned(userId: string, id: string): Promise<AiSessionEntity | null> {
    // SQL：SELECT * FROM kh_ai_session WHERE id = :id AND user_id = :userId LIMIT 1。
    return this.sessionRepo.findOne({ where: { id, userId } });
  }

  /**
   * @description 查询会话消息，按创建时间和雪花 ID 正序
   * @param sessionId string，会话 ID
   * @returns Promise<AiMessageEntity[]>，会话内全部消息
   */
  async findMessages(sessionId: string): Promise<AiMessageEntity[]> {
    // SQL：SELECT * FROM kh_ai_message WHERE session_id = :sessionId
    // ORDER BY created_at ASC, id ASC。
    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  /**
   * @description 保存一轮用户与助手消息
   * @param messages Partial<AiMessageEntity>[]，本轮两条消息
   * @returns Promise<AiMessageEntity[]>，落库后的消息
   */
  async saveMessages(
    messages: Array<Partial<AiMessageEntity>>,
  ): Promise<AiMessageEntity[]> {
    // SQL：INSERT INTO kh_ai_message (...) VALUES (...), (...) RETURNING *。
    return this.messageRepo.save(this.messageRepo.create(messages));
  }

  /**
   * @description 删除会话的全部消息
   * @param sessionId string，会话 ID
   * @returns Promise<void>，删除完成后无返回值
   */
  async deleteMessages(sessionId: string): Promise<void> {
    // SQL：DELETE FROM kh_ai_message WHERE session_id = :sessionId。
    await this.messageRepo.delete({ sessionId });
  }

  /**
   * @description 删除会话
   * @param id string，会话 ID
   * @returns Promise<void>，删除完成后无返回值
   */
  async deleteSession(id: string): Promise<void> {
    // SQL：DELETE FROM kh_ai_session WHERE id = :id。
    await this.sessionRepo.delete({ id });
  }
}

export { ChatSessionRepository };
