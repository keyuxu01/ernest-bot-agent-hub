import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

/** 团队（PostgreSQL kh_team）；parent_id 为 0 表示根团队，软删；映射到表 kh_team */
@Entity('kh_team')
class TeamEntity {
  // 主键 id BIGINT（雪花 ID，JS 侧用字符串）
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  // 列 team_name VARCHAR(100)；团队名称，如「技术中心」
  @Column({ name: 'team_name', type: 'varchar', length: 100 })
  teamName: string;

  // 列 team_code VARCHAR(50)，可空；团队编码，如 'TECH_CENTER'（不要求唯一）
  @Column({ name: 'team_code', type: 'varchar', length: 50, nullable: true })
  teamCode?: string | null;

  // 列 description VARCHAR(500)，可空；团队描述
  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  // 列 leader_id BIGINT，可空；负责人 → kh_user.id（没有外键约束，也不会自动写进成员表）
  @Column({
    name: 'leader_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  leaderId?: string | null;

  // 列 parent_id BIGINT，默认 0；父团队 ID，0 表示根团队，用来组成团队树
  @Column({
    name: 'parent_id',
    type: 'bigint',
    default: '0',
    transformer: bigintTransformer,
  })
  parentId: string;

  // 列 sort INT，默认 0；同级排序，越小越靠前
  @Column({ type: 'int', default: 0 })
  sort: number;

  // 列 status SMALLINT，默认 1；0 禁用 1 启用，禁用的团队不出现在团队树里
  @Column({ type: 'smallint', default: 1 })
  status: number;

  // 列 created_at TIMESTAMPTZ；插入时自动写当前时间
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // 列 updated_at TIMESTAMPTZ；每次 save 更新时自动写当前时间
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // 列 deleted BOOLEAN，默认 false；软删标记，true 表示已删除
  @Column({ type: 'boolean', default: false })
  deleted: boolean;
}

export { TeamEntity };
