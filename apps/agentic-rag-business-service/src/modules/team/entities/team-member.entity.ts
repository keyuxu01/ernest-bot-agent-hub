import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

/** 团队成员（PostgreSQL kh_team_member）：一行表示「某用户在某团队里」；映射到表 kh_team_member */
@Entity('kh_team_member')
class TeamMemberEntity {
  // 主键 id BIGINT（雪花 ID，JS 侧用字符串）
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  // 列 team_id BIGINT → kh_team.id；哪个团队
  @Column({ name: 'team_id', type: 'bigint', transformer: bigintTransformer })
  teamId: string;

  // 列 user_id BIGINT → kh_user.id（有外键，用户必须存在）；哪个用户
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: string;

  // 列 member_role VARCHAR(20)，默认 'member'；成员身份：leader 负责人 / member 普通成员
  @Column({
    name: 'member_role',
    type: 'varchar',
    length: 20,
    default: 'member',
  })
  memberRole: string;

  // 列 created_at TIMESTAMPTZ；加入时间，插入时自动写入
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

export { TeamMemberEntity };
