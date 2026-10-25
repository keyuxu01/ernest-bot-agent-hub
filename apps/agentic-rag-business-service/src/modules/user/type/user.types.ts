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

export type { AuthUser, RoleCodeValue };
