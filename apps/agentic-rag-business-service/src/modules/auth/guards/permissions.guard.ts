import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleCode } from '../../user/constants/user.constants';
import type { AuthUser } from '../../user/type/user.types';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

/**
 * 权限码守卫（在 JwtAuthGuard、RolesGuard 之后执行）
 *
 * - 未标 @RequirePermission → 放行
 * - ROLE_ADMIN → 放行
 * - 否则 request.user.permissions 须命中其一，不满足 → 403 权限不足
 */
@Injectable()
class PermissionsGuard implements CanActivate {
  /**
   * @description 注入 Nest 的 Reflector，用来读取接口上 @RequirePermission 贴的元数据
   * @param reflector Reflector，元数据读取工具
   */
  constructor(private readonly reflector: Reflector) {}

  /**
   * @description 每个 HTTP 请求进入 Controller 前执行，判断当前用户是否有接口要求的权限码
   * @param context ExecutionContext，当前请求上下文，可取到将执行的方法、所属类和 request 对象
   * @returns boolean，true 放行；不满足时直接抛 ForbiddenException（403 权限不足）
   */
  canActivate(context: ExecutionContext): boolean {
    // 读 'permissions' 元数据：先看方法上的 @RequirePermission，没有再看类上的
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    // 接口没标 @RequirePermission：不做权限码校验
    if (!required?.length) {
      return true;
    }

    // request.user 由 JwtAuthGuard → JwtStrategy.validate → buildAuthUser 写入
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    // 没有登录用户（如 @Public() 接口）却要求权限码：拒绝
    if (!user) {
      throw new ForbiddenException('权限不足');
    }

    // 管理员不看权限码，直接放行
    if (user.roles.includes(RoleCode.ADMIN)) {
      return true;
    }

    // 用户的生效权限转成 Set，判断是否拥有要求的任意一个权限码
    const owned = new Set(user.permissions ?? []);
    const ok = required.some((p) => owned.has(p));
    if (!ok) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}

export { PermissionsGuard };
