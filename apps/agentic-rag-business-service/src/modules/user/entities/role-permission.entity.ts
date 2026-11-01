import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

/** 角色-权限关联（PostgreSQL kh_role_permission）：一行表示「某角色拥有某权限」；映射到表 kh_role_permission */
@Entity('kh_role_permission')
class RolePermissionEntity {
  // 主键 id BIGINT（雪花 ID，JS 侧用字符串）
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  // 列 role_id BIGINT → kh_role.id；哪个角色
  @Column({ name: 'role_id', type: 'bigint', transformer: bigintTransformer })
  roleId: string;

  // 列 permission_id BIGINT → kh_permission.id；拥有哪个权限
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

export { RolePermissionEntity };
