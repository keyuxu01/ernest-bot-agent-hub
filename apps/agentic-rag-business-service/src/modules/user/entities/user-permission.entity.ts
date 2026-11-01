import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

/** 用户直接权限（PostgreSQL kh_user_permission）：一行表示「某用户直接拥有某权限」，与角色权限合并生效；映射到表 kh_user_permission */
@Entity('kh_user_permission')
class UserPermissionEntity {
  // 主键 id BIGINT（雪花 ID，JS 侧用字符串）
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  // 列 user_id BIGINT → kh_user.id；哪个用户
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: string;

  // 列 permission_id BIGINT → kh_permission.id；直接拥有哪个权限
  @Column({
    name: 'permission_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  permissionId: string;

  // 列 created_at TIMESTAMPTZ；绑定时间，插入时自动写入
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

export { UserPermissionEntity };
