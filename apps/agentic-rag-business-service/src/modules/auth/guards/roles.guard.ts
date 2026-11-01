import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, RoleCodeValue } from '../../user/type/user.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * 角色守卫
 *
 * 在 JwtAuthGuard 之后执行（同为 APP_GUARD，按注册顺序：先 JWT、后 Roles）。
 *
 * 规则：
 * - 接口未标 @Roles() → 放行（仅要求已登录）
 * - 接口标了 @Roles('ROLE_REVIEWER', ...) → request.user.roles 须命中其一
 * - 不满足 → 403 权限不足
 *
 * 示例：文档审核 approve / reject 需 ROLE_REVIEWER 或 ROLE_ADMIN。
 */
@Injectable()
class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCodeValue[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user?.roles?.length) {
      throw new ForbiddenException('权限不足');
    }

    const ok = requiredRoles.some((role) => user.roles.includes(role));
    if (!ok) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}

export { RolesGuard };
