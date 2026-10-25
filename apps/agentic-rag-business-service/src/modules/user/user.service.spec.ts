import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserEntity } from './entities/user.entity';
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
    status: 1,
    deleted: false,
    ...overrides,
  } as UserEntity;
}

const userRepo = {
  findByUsername: vi.fn(),
  findById: vi.fn(),
  getRoleCodes: vi.fn(),
  saveUser: vi.fn(),
  findRoleByCode: vi.fn(),
  findUserRole: vi.fn(),
  saveUserRole: vi.fn(),
  touchLastLogin: vi.fn(),
  getUserIdsByRoleCode: vi.fn(),
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
  service = new UserService(userRepo as unknown as UserRepository);
});

describe('UserService.validateCredentials', () => {
  it('returns the auth user with roles', async () => {
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
    });
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
      service.ensureBootstrapAdmin('admin', 'strong-password'),
    ).resolves.toBe(true);
    expect(
      userRepo.saveUserRole.mock.calls.map(([link]) => link.roleId),
    ).toEqual(['role-ROLE_USER', 'role-ROLE_ADMIN', 'role-ROLE_REVIEWER']);
  });

  it('leaves an existing admin untouched', async () => {
    userRepo.findByUsername.mockResolvedValue(userRow());

    await expect(
      service.ensureBootstrapAdmin('alice', 'strong-password'),
    ).resolves.toBe(false);
    expect(userRepo.saveUser).not.toHaveBeenCalled();
  });
});
