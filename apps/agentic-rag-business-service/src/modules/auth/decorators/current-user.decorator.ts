import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../../user/type/user.types';

/** 从 request.user 取当前登录用户（需 JwtAuthGuard） */
const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);

export { CurrentUser };
