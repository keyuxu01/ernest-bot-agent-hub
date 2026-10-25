import type { RoleCode } from '../constants/user.constants';

type RoleCodeValue = (typeof RoleCode)[keyof typeof RoleCode];

/** JWT 校验后注入到 Controller 的当前用户 */
interface AuthUser {
  userId: string;
  username: string;
  realName?: string | null;
  email?: string | null;
  avatar?: string | null;
  roles: string[];
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

export type { AuthUser, RoleCodeValue, UserPageQuery, UserVO };
