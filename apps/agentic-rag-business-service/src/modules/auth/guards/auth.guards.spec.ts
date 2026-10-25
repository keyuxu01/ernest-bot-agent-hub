import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../user/type/user.types';
import type { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const user: AuthUser = {
  userId: '10001',
  username: 'alice',
  realName: null,
  email: null,
  avatar: null,
  roles: ['ROLE_USER'],
};

function httpContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const reflector = new Reflector();
  const guard = new JwtAuthGuard(reflector);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lets @Public() routes through without invoking passport', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );

    expect(guard.canActivate(httpContext({ headers: {} }))).toBe(true);
  });

  it('turns a missing user into 401', () => {
    expect(() => guard.handleRequest(null, false)).toThrow(
      UnauthorizedException,
    );
  });

  it('rethrows strategy errors and passes the user through', () => {
    const strategyError = new UnauthorizedException('无效的 access token');

    expect(() => guard.handleRequest(strategyError, user)).toThrow(
      strategyError,
    );
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});

describe('JwtStrategy.validate', () => {
  const authService = { buildAuthUser: vi.fn() };
  const config = {
    getOrThrow: () => 'test-secret-test-secret-test-secret-123',
  };
  const strategy = new JwtStrategy(
    config as unknown as ConfigService,
    authService as unknown as AuthService,
  );

  beforeEach(() => {
    authService.buildAuthUser.mockReset();
  });

  it('rejects refresh tokens used as access tokens', async () => {
    await expect(
      strategy.validate({ sub: '10001', username: 'alice', type: 'refresh' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.buildAuthUser).not.toHaveBeenCalled();
  });

  it('loads the current user for access tokens', async () => {
    authService.buildAuthUser.mockResolvedValue(user);

    await expect(
      strategy.validate({ sub: '10001', username: 'alice', type: 'access' }),
    ).resolves.toBe(user);
    expect(authService.buildAuthUser).toHaveBeenCalledWith('10001');
  });
});

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function requireRoles(roles: string[] | undefined) {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === ROLES_KEY ? roles : undefined,
    );
  }

  it('allows routes without @Roles()', () => {
    requireRoles(undefined);

    expect(guard.canActivate(httpContext({ user }))).toBe(true);
  });

  it('allows a user holding one of the required roles', () => {
    requireRoles(['ROLE_REVIEWER', 'ROLE_ADMIN']);

    expect(
      guard.canActivate(
        httpContext({ user: { ...user, roles: ['ROLE_ADMIN'] } }),
      ),
    ).toBe(true);
  });

  it('throws ForbiddenException when the role is missing', () => {
    requireRoles(['ROLE_REVIEWER']);

    expect(() => guard.canActivate(httpContext({ user }))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when the user has no roles', () => {
    requireRoles(['ROLE_REVIEWER']);

    expect(() =>
      guard.canActivate(httpContext({ user: { ...user, roles: [] } })),
    ).toThrow(ForbiddenException);
  });
});
