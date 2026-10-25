import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../user/type/user.types';
import type { UserService } from '../user/user.service';
import { AuthService } from './auth.service';

const user: AuthUser = {
  userId: '10001',
  username: 'alice',
  realName: 'Alice',
  email: null,
  avatar: null,
  roles: ['ROLE_USER'],
};

const userService = {
  validateCredentials: vi.fn(),
  buildAuthUser: vi.fn(),
  register: vi.fn(),
  touchLastLogin: vi.fn(),
  getUserIdsByRoleCode: vi.fn(),
  ensureBootstrapAdmin: vi.fn(),
};
const configValues: Record<string, unknown> = {};
const config = {
  get: vi.fn(
    (key: string, fallback?: unknown) => configValues[key] ?? fallback,
  ),
};
const jwtService = new JwtService({ secret: 'test-secret' });

let service: AuthService;

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(configValues)) delete configValues[key];
  userService.validateCredentials.mockResolvedValue(user);
  userService.buildAuthUser.mockResolvedValue(user);
  service = new AuthService(
    userService as unknown as UserService,
    jwtService,
    config as unknown as ConfigService,
  );
});

describe('AuthService.login', () => {
  it('issues access / refresh tokens with the default 2h expiry', async () => {
    const result = await service.login({ username: 'alice', password: 'pw' });

    expect(result).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 7200,
      userInfo: user,
    });
    expect(userService.touchLastLogin).toHaveBeenCalledWith('10001');
    expect(jwtService.verify(result.accessToken)).toMatchObject({
      sub: '10001',
      username: 'alice',
      type: 'access',
    });
    expect(jwtService.verify(result.refreshToken)).toMatchObject({
      type: 'refresh',
    });
  });

  it('derives expiresIn from JWT_ACCESS_EXPIRES', async () => {
    configValues.JWT_ACCESS_EXPIRES = '30m';

    const result = await service.login({ username: 'alice', password: 'pw' });

    expect(result.expiresIn).toBe(1800);
  });

  it('propagates credential errors without recording a login', async () => {
    userService.validateCredentials.mockRejectedValue(
      new UnauthorizedException('用户名或密码错误'),
    );

    await expect(
      service.login({ username: 'alice', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userService.touchLastLogin).not.toHaveBeenCalled();
  });
});

describe('AuthService.refresh', () => {
  it('exchanges a refresh token for a new pair', async () => {
    const { refreshToken } = await service.login({
      username: 'alice',
      password: 'pw',
    });

    await expect(service.refresh(refreshToken)).resolves.toMatchObject({
      userInfo: user,
    });
    expect(userService.buildAuthUser).toHaveBeenCalledWith('10001');
  });

  it('rejects an access token', async () => {
    const { accessToken } = await service.login({
      username: 'alice',
      password: 'pw',
    });

    await expect(service.refresh(accessToken)).rejects.toThrow(
      '无效的 refresh token',
    );
  });

  it('rejects tokens signed with another secret', async () => {
    const forged = new JwtService({ secret: 'other' }).sign({
      sub: '10001',
      username: 'alice',
      type: 'refresh',
    });

    await expect(service.refresh(forged)).rejects.toThrow(
      'refresh token 无效或已过期',
    );
  });
});

describe('AuthService.register / getMe / getReviewerIds', () => {
  it('returns the new user id with a message', async () => {
    userService.register.mockResolvedValue({ userId: '10002' });

    await expect(
      service.register({ username: 'bob', password: '123456' }),
    ).resolves.toEqual({ userId: '10002', message: '注册成功，请登录' });
  });

  it('loads the current user and reviewer ids', async () => {
    userService.getUserIdsByRoleCode.mockResolvedValue(['20001']);

    await expect(service.getMe('10001')).resolves.toBe(user);
    await expect(service.getReviewerIds()).resolves.toEqual(['20001']);
    expect(userService.getUserIdsByRoleCode).toHaveBeenCalledWith(
      'ROLE_REVIEWER',
    );
  });
});

describe('AuthService.onModuleInit', () => {
  it('does nothing without bootstrap admin settings', async () => {
    await service.onModuleInit();

    expect(userService.ensureBootstrapAdmin).not.toHaveBeenCalled();
  });

  it('ensures the configured bootstrap admin exists', async () => {
    configValues.AUTH_BOOTSTRAP_ADMIN_USERNAME = 'admin';
    configValues.AUTH_BOOTSTRAP_ADMIN_PASSWORD = 'strong-password';

    await service.onModuleInit();

    expect(userService.ensureBootstrapAdmin).toHaveBeenCalledWith(
      'admin',
      'strong-password',
    );
  });
});
