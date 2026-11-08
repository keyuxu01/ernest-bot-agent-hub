import type { RoleCode } from '../constants/user.constants';
import type { PermissionEntity } from '../entities/permission.entity';

type RoleCodeValue = (typeof RoleCode)[keyof typeof RoleCode];

/** JWT 校验后注入到 Controller 的当前用户 */
interface AuthUser {
  userId: string;
  username: string;
  realName?: string | null;
  email?: string | null;
  avatar?: string | null;
  roles: string[];
  /** 生效权限码：直接权限 + 角色权限；管理员追加 ADMIN_OPERATION_PERMISSIONS */
  permissions: string[];
  /** 所在团队（含担任负责人的团队），用于文档可见性 */
  teamIds: string[];
}

/** 用户对外展示（不含 password） */
interface UserVO {
  id: string;
  username: string;
  email?: string | null;
  realName?: string | null;
  avatar?: string | null;
  status: number;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roleCodes: string[];
}

/** 用户分页查询条件（Repository 入参） */
interface UserPageQuery {
  keyword?: string;
  roleCode?: string;
  status?: number;
  page: number;
  pageSize: number;
}

/** 权限分页查询条件（Repository 入参） */
interface PermissionPageQuery {
  keyword?: string;
  page: number;
  pageSize: number;
}

/** 权限树节点 */
type PermissionTreeNode = PermissionEntity & { children: PermissionTreeNode[] };

export type {
  AuthUser,
  PermissionPageQuery,
  PermissionTreeNode,
  RoleCodeValue,
  UserPageQuery,
  UserVO,
};
