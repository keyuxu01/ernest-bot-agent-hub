import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../user/type/user.types';
import type { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import type { EmailActivationService } from './email-activation.service';
import type { EmailService } from './email.service';
import type { PasswordResetService } from './password-reset.service';

const user: AuthUser = {
  userId: '10001',
  username: 'alice',
  realName: 'Alice',
  email: null,
  avatar: null,
  roles: ['ROLE_USER'],
};

const userService = {
  findByEmail: vi.fn(),
  activateEmail: vi.fn(),
  resetPasswordByEmail: vi.fn(),
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
const emailService = {
  sendActivationEmail: vi.fn(),
  sendResetCodeEmail: vi.fn(),
};
const emailActivation = {
  createToken: vi.fn(),
  consumeToken: vi.fn(),
  deleteByToken: vi.fn(),
};
const passwordReset = {
  set: vi.fn(),
  getTtl: vi.fn(),
  verify: vi.fn(),
  recordFailedAttempt: vi.fn(),
  delete: vi.fn(),
};

let service: AuthService;

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(configValues)) delete configValues[key];
  userService.validateCredentials.mockResolvedValue(user);
  userService.buildAuthUser.mockResolvedValue(user);
  emailActivation.createToken.mockResolvedValue('activation-token');
  passwordReset.getTtl.mockResolvedValue(-2);
  passwordReset.verify.mockResolvedValue(true);
  service = new AuthService(
    userService as unknown as UserService,
    jwtService,
    config as unknown as ConfigService,
    emailService as unknown as EmailService,
    emailActivation as unknown as EmailActivationService,
    passwordReset as unknown as PasswordResetService,
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
    expect(userService.register).toHaveBeenCalledWith(
      expect.objectContaining({ requireEmailVerification: false }),
    );
    expect(emailService.sendActivationEmail).not.toHaveBeenCalled();
  });

  it('sends an activation email when verification is required', async () => {
    configValues.REQUIRE_EMAIL_VERIFICATION = 'true';
    userService.register.mockResolvedValue({
      userId: '10002',
      emailVerificationRequired: true,
    });

    await expect(
      service.register({
        username: 'bob',
        password: '123456',
        email: 'bob@example.com',
      }),
    ).resolves.toEqual({
      userId: '10002',
      message: '注册成功，请查收邮件激活账户',
      emailVerificationRequired: true,
    });
    expect(emailService.sendActivationEmail).toHaveBeenCalledWith(
      'bob@example.com',
      'bob',
      'activation-token',
    );
  });

  it('drops the activation token when the email cannot be sent', async () => {
    configValues.REQUIRE_EMAIL_VERIFICATION = 'true';
    userService.register.mockResolvedValue({
      userId: '10002',
      emailVerificationRequired: true,
    });
    emailService.sendActivationEmail.mockRejectedValueOnce(new Error('smtp'));

    await expect(
      service.register({
        username: 'bob',
        password: '123456',
        email: 'bob@example.com',
      }),
    ).rejects.toThrow('激活邮件发送失败，请稍后再试');
    expect(emailActivation.deleteByToken).toHaveBeenCalledWith(
      'activation-token',
    );
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

describe('AuthService.verifyEmail', () => {
  it('activates the user behind a valid token', async () => {
    emailActivation.consumeToken.mockResolvedValue('10002');
    userService.activateEmail.mockResolvedValue('账户激活成功，请登录');

    await expect(service.verifyEmail('t')).resolves.toEqual({
      message: '账户激活成功，请登录',
    });
  });

  it('rejects an unknown or expired token', async () => {
    emailActivation.consumeToken.mockResolvedValue(null);

    await expect(service.verifyEmail('t')).rejects.toThrow(
      '激活链接无效或已过期',
    );
  });
});

describe('AuthService password reset', () => {
  it('rejects an unregistered email', async () => {
    userService.findByEmail.mockResolvedValue(null);

    await expect(
      service.sendResetCode({ email: 'nobody@example.com' }),
    ).rejects.toThrow('该邮箱未注册');
  });

  it('enforces the 60s resend cooldown', async () => {
    userService.findByEmail.mockResolvedValue({ username: 'alice' });
    passwordReset.getTtl.mockResolvedValue(580);

    await expect(
      service.sendResetCode({ email: 'alice@example.com' }),
    ).rejects.toThrow('验证码已发送，请稍后再试');
    expect(passwordReset.set).not.toHaveBeenCalled();
  });

  it('stores a 6-digit code and emails it', async () => {
    userService.findByEmail.mockResolvedValue({ username: 'alice' });

    await expect(
      service.sendResetCode({ email: 'alice@example.com' }),
    ).resolves.toEqual({ message: '验证码已发送' });
    const code = passwordReset.set.mock.calls[0]?.[1];
    expect(code).toMatch(/^\d{6}$/);
    expect(emailService.sendResetCodeEmail).toHaveBeenCalledWith(
      'alice@example.com',
      'alice',
      code,
    );
  });

  it('clears the code when the email cannot be sent', async () => {
    userService.findByEmail.mockResolvedValue({ username: 'alice' });
    emailService.sendResetCodeEmail.mockRejectedValueOnce(new Error('smtp'));

    await expect(
      service.sendResetCode({ email: 'alice@example.com' }),
    ).rejects.toThrow('邮件发送失败，请稍后再试');
    expect(passwordReset.delete).toHaveBeenCalledWith('alice@example.com');
  });

  it('resets the password with a valid code and consumes it', async () => {
    await expect(
      service.resetPasswordByEmail({
        email: 'alice@example.com',
        code: '123456',
        newPassword: 'new-password',
      }),
    ).resolves.toEqual({ message: '密码重置成功，请登录' });
    expect(userService.resetPasswordByEmail).toHaveBeenCalledWith(
      'alice@example.com',
      'new-password',
    );
    expect(passwordReset.delete).toHaveBeenCalledWith('alice@example.com');
  });

  it('rejects a wrong code and records the attempt', async () => {
    passwordReset.verify.mockResolvedValue(false);
    passwordReset.recordFailedAttempt.mockResolvedValue(false);

    await expect(
      service.resetPasswordByEmail({
        email: 'alice@example.com',
        code: '000000',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow('验证码错误或已过期');
    expect(passwordReset.recordFailedAttempt).toHaveBeenCalledWith(
      'alice@example.com',
    );
    expect(userService.resetPasswordByEmail).not.toHaveBeenCalled();
  });

  it('tells the user to request a new code once attempts are exhausted', async () => {
    passwordReset.verify.mockResolvedValue(false);
    passwordReset.recordFailedAttempt.mockResolvedValue(true);

    await expect(
      service.resetPasswordByEmail({
        email: 'alice@example.com',
        code: '000000',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow('验证码错误次数过多，请重新获取');
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
