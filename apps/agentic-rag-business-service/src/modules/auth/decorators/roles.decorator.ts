import { SetMetadata } from '@nestjs/common';
import type { RoleCodeValue } from '../../user/type/user.types';

const ROLES_KEY = 'roles';

/** 要求用户拥有指定角色之一（需配合 RolesGuard） */
const Roles = (...roles: RoleCodeValue[]) => SetMetadata(ROLES_KEY, roles);

export { Roles, ROLES_KEY };
