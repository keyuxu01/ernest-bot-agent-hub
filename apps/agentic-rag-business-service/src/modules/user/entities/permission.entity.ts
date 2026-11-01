import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

/** 权限（PostgreSQL kh_permission）；parent_id 为 0 表示根节点，软删；映射到表 kh_permission */
@Entity('kh_permission')
class PermissionEntity {
  // 主键 id BIGINT；transformer 把数据库 bigint 与 JS 字符串互转（雪花 ID 超出 JS number 精度）
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  // 列 parent_id BIGINT，默认 0；父权限 ID，0 表示根节点，用来组成权限树
  @Column({
    name: 'parent_id',
    type: 'bigint',
    default: '0',
    transformer: bigintTransformer,
  })
  parentId: string;

  // 列 permission_name VARCHAR(50)；权限名称，展示用，如「文档列表」
  @Column({ name: 'permission_name', type: 'varchar', length: 50 })
  permissionName: string;

  // 列 permission_code VARCHAR(100) UNIQUE；权限编码，接口上 @RequirePermission 校验的就是它，如 'document:list'
  @Column({
    name: 'permission_code',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  permissionCode: string;

  // 列 permission_type SMALLINT；1 菜单 2 按钮 3 接口
  @Column({ name: 'permission_type', type: 'smallint' })
  permissionType: number;

  // 列 menu_url VARCHAR(200)，可空；菜单对应的前端路由，如 '/documents'
  @Column({ name: 'menu_url', type: 'varchar', length: 200, nullable: true })
  menuUrl?: string | null;

  // 列 api_url VARCHAR(500)，可空；接口 URL 描述（只做记录，不参与校验）
  @Column({ name: 'api_url', type: 'varchar', length: 500, nullable: true })
  apiUrl?: string | null;

  // 列 method VARCHAR(10)，可空；接口 HTTP 方法描述，如 'GET'（只做记录）
  @Column({ type: 'varchar', length: 10, nullable: true })
  method?: string | null;

  // 列 icon VARCHAR(50)，可空；菜单图标名，如 'FileTextOutlined'
  @Column({ type: 'varchar', length: 50, nullable: true })
  icon?: string | null;

  // 列 sort INT，默认 0；同级排序，越小越靠前
  @Column({ type: 'int', default: 0 })
  sort: number;

  // 列 status SMALLINT，默认 1；0 禁用 1 启用，禁用的权限不生效
  @Column({ type: 'smallint', default: 1 })
  status: number;

  // 列 created_at TIMESTAMPTZ；插入时自动写当前时间
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // 列 updated_at TIMESTAMPTZ；每次 save 更新时自动写当前时间
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // 列 deleted BOOLEAN，默认 false；软删标记，true 表示已删除（行还在表里）
  @Column({ type: 'boolean', default: false })
  deleted: boolean;
}

export { PermissionEntity };
