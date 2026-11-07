import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

/** AI 会话（PostgreSQL `kh_ai_session`） */
@Entity('kh_ai_session')
class AiSessionEntity {
  // 列 id BIGINT PRIMARY KEY；AI 会话雪花 ID，以 string 暴露避免 JS 精度丢失
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  // 列 user_id BIGINT NOT NULL；会话所属用户 ID，所有读写都用它校验归属
  @Column({
    name: 'user_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  userId: string;

  // 列 title VARCHAR(80) NOT NULL；会话列表展示标题
  @Column({ type: 'varchar', length: 80 })
  title: string;

  // 列 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()；会话创建时间
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // 列 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()；最后一次问答或重命名时间
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

export { AiSessionEntity };
