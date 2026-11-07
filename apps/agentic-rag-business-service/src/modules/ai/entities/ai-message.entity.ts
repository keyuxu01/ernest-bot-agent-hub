import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';
import type { ChatSource } from '../type/ai-chat.types';

/** AI 会话消息（PostgreSQL `kh_ai_message`） */
@Entity('kh_ai_message')
class AiMessageEntity {
  // 列 id BIGINT PRIMARY KEY；AI 消息雪花 ID，以 string 暴露避免 JS 精度丢失
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  // 列 session_id BIGINT NOT NULL；所属会话 ID，数据库外键删除会话时级联删除消息
  @Column({
    name: 'session_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  sessionId: string;

  // 列 role VARCHAR(16) NOT NULL；消息角色只允许 user / assistant
  @Column({ type: 'varchar', length: 16 })
  role: 'user' | 'assistant';

  // 列 content TEXT NOT NULL；用户问题或助手完整回答
  @Column({ type: 'text' })
  content: string;

  // 列 sources JSONB；助手回答引用的资料摘录，用户消息为空
  @Column({ type: 'jsonb', nullable: true })
  sources?: ChatSource[] | null;

  // 列 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()；消息创建时间
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

export { AiMessageEntity };
