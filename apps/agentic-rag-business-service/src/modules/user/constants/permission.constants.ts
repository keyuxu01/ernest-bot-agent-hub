import { RoleCode } from './user.constants';

/** 管理员自动拥有的操作权限（不依赖 kh_role_permission 绑定） */
const ADMIN_OPERATION_PERMISSIONS = [
  'document:list',
  'document:create',
  'document:edit',
  'document:delete',
  'document:review',
  'document:category',
  'document:category:query',
  'document:tag',
  'document:version',
  'system:user',
  'system:role',
  'system:permission',
  'system:permission:create',
  'system:permission:edit',
  'system:permission:delete',
  'system:team',
  'system:statistics',
  'system:settings',
] as const;

const ADMIN_ROLES = [RoleCode.ADMIN] as const;

/** kh_permission.permission_type：1 菜单 2 按钮 3 接口 */
enum PermissionType {
  Menu = 1,
  Button = 2,
  Api = 3,
}

export { ADMIN_OPERATION_PERMISSIONS, ADMIN_ROLES, PermissionType };
