import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserEntity } from './entities/user.entity';
import type { DocumentRepository } from '../document/repository/document.repository';
import type { PermissionService } from './permission.service';
import type { UserRepository } from './repository/user.repository';
import { UserService } from './user.service';

let passwordHash: string;

function userRow(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: '10001',
    username: 'alice',
    password: passwordHash,
    realName: 'Alice',
    email: null,
    avatar: null,
    emailVerified: 1,
    status: 1,
    deleted: false,
    ...overrides,
  } as UserEntity;
}

const userRepo = {
  findByEmail: vi.fn(),
  findByUsername: vi.fn(),
  findById: vi.fn(),
  getRoleCodes: vi.fn(),
  saveUser: vi.fn(),
  save: vi.fn(),
  findRoleByCode: vi.fn(),
  findActiveRolesByCodes: vi.fn(),
  findUserRole: vi.fn(),
  saveUserRole: vi.fn(),
  deleteUserRoles: vi.fn(),
  touchLastLogin: vi.fn(),
  getUserIdsByRoleCode: vi.fn(),
  findPage: vi.fn(),
};
const documentRepo = {
  countActiveByAuthor: vi.fn(),
  sumStatsByAuthor: vi.fn(),
};

const permissionService = {
  getUserPermissionCodes: vi.fn(),
};

let service: UserService;

beforeAll(async () => {
  passwordHash = await hash('123456', 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  userRepo.getRoleCodes.mockResolvedValue(['ROLE_USER']);
  userRepo.findRoleByCode.mockImplementation(async (roleCode: string) => ({
    id: `role-${roleCode}`,
    roleCode,
  }));
  userRepo.findUserRole.mockResolvedValue(null);
  userRepo.findByEmail.mockResolvedValue(null);
  userRepo.save.mockImplementation(async (u: UserEntity) => u);
  permissionService.getUserPermissionCodes.mockResolvedValue(['document:list']);
  service = new UserService(
    userRepo as unknown as UserRepository,
    documentRepo as unknown as DocumentRepository,
    permissionService as unknown as PermissionService,
  );
});

describe('UserService.validateCredentials', () => {
  it('returns the auth user with roles and permissions', async () => {
    userRepo.findByUsername.mockResolvedValue(userRow());

    await expect(
      service.validateCredentials('alice', '123456'),
    ).resolves.toEqual({
      userId: '10001',
      username: 'alice',
      realName: 'Alice',
      email: null,
      avatar: null,
      roles: ['ROLE_USER'],
      permissions: ['document:list'],
    });
    expect(permissionService.getUserPermissionCodes).toHaveBeenCalledWith(
      '10001',
    );
  });

  it.each([
    ['unknown user', null, '123456', '用户名或密码错误'],
    ['wrong password', 'row', 'wrong', '用户名或密码错误'],
  ])('rejects %s', async (_case, row, password, message) => {
    userRepo.findByUsername.mockResolvedValue(row ? userRow() : null);

    await expect(
      service.validateCredentials('alice', password),
    ).rejects.toThrow(new UnauthorizedException(message));
  });

  it('rejects a disabled account', async () => {
    userRepo.findByUsername.mockResolvedValue(userRow({ status: 0 }));

    await expect(
      service.validateCredentials('alice', '123456'),
    ).rejects.toThrow('账户已禁用');
  });

  it('rejects an enabled account whose email is not verified', async () => {
    userRepo.findByUsername.mockResolvedValue(userRow({ emailVerified: 0 }));

    await expect(
      service.validateCredentials('alice', '123456'),
    ).rejects.toThrow('账户未激活，请先验证邮箱');
  });

  it('reports a pending-activation account as not activated', async () => {
    userRepo.findByUsername.mockResolvedValue(
      userRow({ status: 0, emailVerified: 0 }),
    );

    await expect(
      service.validateCredentials('alice', '123456'),
    ).rejects.toThrow('账户未激活，请先验证邮箱');
  });
});

describe('UserService.register email verification', () => {
  it('rejects an email already in use', async () => {
    userRepo.findByUsername.mockResolvedValue(null);
    userRepo.findByEmail.mockResolvedValue(userRow());

    await expect(
      service.register({
        username: 'bob',
        password: '123456',
        email: 'a@example.com',
      }),
    ).rejects.toThrow('邮箱已被使用');
  });

  it('creates a disabled, unverified user when verification is required', async () => {
    userRepo.findByUsername.mockResolvedValue(null);

    const result = await service.register({
      username: 'bob',
      password: '123456',
      email: 'bob@example.com',
      requireEmailVerification: true,
    });

    expect(result.emailVerificationRequired).toBe(true);
    expect(userRepo.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({ status: 0, emailVerified: 0 }),
    );
  });

  it('activates email and enables the account', async () => {
    const pending = userRow({ status: 0, emailVerified: 0 });
    userRepo.findById.mockResolvedValue(pending);

    await expect(service.activateEmail('10001')).resolves.toBe(
      '账户激活成功，请登录',
    );
    expect(pending).toMatchObject({ status: 1, emailVerified: 1 });

    userRepo.findById.mockResolvedValue(userRow());
    await expect(service.activateEmail('10001')).resolves.toBe(
      '账户已激活，请直接登录',
    );
  });
});

describe('UserService admin and profile', () => {
  it('replaces roles and reports missing role codes', async () => {
    userRepo.findById.mockResolvedValue(userRow());
    userRepo.findActiveRolesByCodes.mockResolvedValueOnce([
      { id: 'r1', roleCode: 'ROLE_ADMIN' },
    ]);
    await expect(
      service.replaceRoles('10001', ['ROLE_ADMIN', 'ROLE_X']),
    ).rejects.toThrow('角色不存在: ROLE_X');
    expect(userRepo.deleteUserRoles).not.toHaveBeenCalled();

    userRepo.findActiveRolesByCodes.mockResolvedValueOnce([
      { id: 'r1', roleCode: 'ROLE_ADMIN' },
    ]);
    await expect(
      service.replaceRoles('10001', ['ROLE_ADMIN']),
    ).resolves.toEqual(['ROLE_ADMIN']);
    expect(userRepo.deleteUserRoles).toHaveBeenCalledWith('10001');
    expect(userRepo.saveUserRole).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '10001', roleId: 'r1' }),
    );
  });

  it('changes the password only when the old one matches', async () => {
    userRepo.findById.mockResolvedValue(userRow());

    await expect(
      service.changePassword('10001', 'wrong', 'new-password'),
    ).rejects.toThrow('原密码错误');
    await service.changePassword('10001', '123456', 'new-password');
    expect(userRepo.save).toHaveBeenCalled();
  });

  it('aggregates the author document statistics', async () => {
    userRepo.findById.mockResolvedValue(userRow());
    documentRepo.countActiveByAuthor.mockResolvedValue(3);
    documentRepo.sumStatsByAuthor.mockResolvedValue({
      viewCount: '10',
      likeCount: '2',
      commentCount: '1',
    });

    await expect(service.getUserStatistics('10001')).resolves.toEqual({
      documentCount: 3,
      viewCount: 10,
      likeCount: 2,
      commentCount: 1,
    });
  });
});

describe('UserService.buildAuthUser', () => {
  it('throws NotFound for a missing user and Unauthorized when disabled', async () => {
    userRepo.findById.mockResolvedValueOnce(null);
    await expect(service.buildAuthUser('10001')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    userRepo.findById.mockResolvedValueOnce(userRow({ status: 0 }));
    await expect(service.buildAuthUser('10001')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('UserService.register / assignRole', () => {
  it('stores a bcrypt hash and assigns ROLE_USER', async () => {
    userRepo.findByUsername.mockResolvedValue(null);

    const { userId } = await service.register({
      username: 'bob',
      password: '123456',
    });

    expect(userId).toMatch(/^\d+$/);
    const saved = userRepo.saveUser.mock.calls[0]?.[0];
    expect(saved).toMatchObject({ id: userId, username: 'bob', status: 1 });
    expect(saved.password).toMatch(/^\$2[aby]\$10\$/);
    expect(userRepo.saveUserRole).toHaveBeenCalledWith(
      expect.objectContaining({ userId, roleId: 'role-ROLE_USER' }),
    );
  });

  it('rejects a taken username', async () => {
    userRepo.findByUsername.mockResolvedValue(userRow());

    await expect(
      service.register({ username: 'alice', password: '123456' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(userRepo.saveUser).not.toHaveBeenCalled();
  });

  it('skips an existing role link and rejects an unknown role', async () => {
    userRepo.findUserRole.mockResolvedValueOnce({ id: 'link' });
    await service.assignRole('10001', 'ROLE_USER');
    expect(userRepo.saveUserRole).not.toHaveBeenCalled();

    userRepo.findRoleByCode.mockResolvedValueOnce(null);
    await expect(
      service.assignRole('10001', 'ROLE_UNKNOWN'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UserService.ensureBootstrapAdmin', () => {
  it('creates the admin with user, admin and reviewer roles', async () => {
    userRepo.findByUsername.mockResolvedValue(null);

    await expect(
      service.ensureBootstrapAdmin(
        'admin',
        'strong-password',
        'admin@example.com',
      ),
    ).resolves.toBe(true);
    expect(userRepo.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@example.com',
        status: 1,
        emailVerified: 1,
      }),
    );
    expect(
      userRepo.saveUserRole.mock.calls.map(([link]) => link.roleId),
    ).toEqual(['role-ROLE_USER', 'role-ROLE_ADMIN', 'role-ROLE_REVIEWER']);
  });

  it('leaves an existing admin untouched', async () => {
    userRepo.findByUsername.mockResolvedValue(userRow());

    await expect(
      service.ensureBootstrapAdmin(
        'alice',
        'strong-password',
        'alice@example.com',
      ),
    ).resolves.toBe(false);
    expect(userRepo.saveUser).not.toHaveBeenCalled();
  });
});

describe('UserService email uniqueness on write', () => {
  it('rejects a profile email owned by another user', async () => {
    userRepo.findById.mockResolvedValue(userRow());
    userRepo.findByEmail.mockResolvedValue(
      userRow({ id: '20002', username: 'bob', email: 'bob@example.com' }),
    );

    await expect(
      service.updateProfile('10001', { email: 'bob@example.com' }),
    ).rejects.toThrow(new ConflictException('邮箱已被使用'));
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('allows keeping the current profile email', async () => {
    const me = userRow({ email: 'alice@example.com' });
    userRepo.findById.mockResolvedValue(me);
    userRepo.findByEmail.mockResolvedValue(me);

    await expect(
      service.updateProfile('10001', { email: 'alice@example.com' }),
    ).resolves.toMatchObject({ email: 'alice@example.com' });
  });

  it('rejects an admin update to an email owned by another user', async () => {
    userRepo.findById.mockResolvedValue(userRow());
    userRepo.findByEmail.mockResolvedValue(userRow({ id: '20002' }));

    await expect(
      service.updateUser('10001', { email: 'bob@example.com' }),
    ).rejects.toThrow(new ConflictException('邮箱已被使用'));
  });

  it('rejects admin creation with an email already in use', async () => {
    userRepo.findByUsername.mockResolvedValue(null);
    userRepo.findByEmail.mockResolvedValue(userRow({ id: '20002' }));

    await expect(
      service.createUser({
        username: 'carol',
        password: '123456',
        email: 'bob@example.com',
      }),
    ).rejects.toThrow(new ConflictException('邮箱已被使用'));
    expect(userRepo.saveUser).not.toHaveBeenCalled();
  });
});
