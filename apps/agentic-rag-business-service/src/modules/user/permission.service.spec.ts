import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_OPERATION_PERMISSIONS } from './constants/permission.constants';
import type { PermissionEntity } from './entities/permission.entity';
import { PermissionService } from './permission.service';
import type { PermissionRepository } from './repository/permission.repository';
import type { RoleRepository } from './repository/role.repository';
import type { UserRepository } from './repository/user.repository';

const permRepo = {
  findAllActive: vi.fn(),
  findById: vi.fn(),
  findByCode: vi.fn(),
  findActiveByIds: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  countChildren: vi.fn(),
  countRoleBindings: vi.fn(),
  countUserBindings: vi.fn(),
  findRolePermissionIds: vi.fn(),
  deleteRolePermissions: vi.fn(),
  saveRolePermission: vi.fn(),
  findUserDirectPermissionCodes: vi.fn(),
  findUserRolePermissionCodes: vi.fn(),
};
const roleRepo = { findById: vi.fn() };
const userRepo = { getRoleCodes: vi.fn() };

let service: PermissionService;

function perm(overrides: Partial<PermissionEntity>): PermissionEntity {
  return {
    id: '1',
    parentId: '0',
    permissionCode: 'p',
    deleted: false,
    ...overrides,
  } as PermissionEntity;
}

beforeEach(() => {
  vi.clearAllMocks();
  permRepo.findUserDirectPermissionCodes.mockResolvedValue([]);
  permRepo.findUserRolePermissionCodes.mockResolvedValue([]);
  userRepo.getRoleCodes.mockResolvedValue(['ROLE_USER']);
  service = new PermissionService(
    permRepo as unknown as PermissionRepository,
    roleRepo as unknown as RoleRepository,
    userRepo as unknown as UserRepository,
  );
});

describe('PermissionService.getUserPermissionCodes', () => {
  it('merges direct and role permissions without duplicates', async () => {
    permRepo.findUserDirectPermissionCodes.mockResolvedValue([
      'document:create',
    ]);
    permRepo.findUserRolePermissionCodes.mockResolvedValue([
      'document:list',
      'document:create',
    ]);

    const codes = await service.getUserPermissionCodes('10001');

    expect(codes.sort()).toEqual(['document:create', 'document:list']);
  });

  it('adds the admin operation permissions for ROLE_ADMIN', async () => {
    userRepo.getRoleCodes.mockResolvedValue(['ROLE_ADMIN']);
    permRepo.findUserRolePermissionCodes.mockResolvedValue(['dashboard']);

    const codes = await service.getUserPermissionCodes('10001');

    expect(codes).toEqual(
      expect.arrayContaining(['dashboard', ...ADMIN_OPERATION_PERMISSIONS]),
    );
    expect(codes).toHaveLength(ADMIN_OPERATION_PERMISSIONS.length + 1);
  });
});

describe('PermissionService management', () => {
  it('builds the tree from parent ids', async () => {
    permRepo.findAllActive.mockResolvedValue([
      perm({ id: '1', parentId: '0' }),
      perm({ id: '2', parentId: '1' }),
      perm({ id: '3', parentId: '0' }),
    ]);

    const tree = await service.getTree();

    expect(tree.map((n) => n.id)).toEqual(['1', '3']);
    expect(tree[0]?.children.map((n) => n.id)).toEqual(['2']);
  });

  it('rejects a duplicate permission code', async () => {
    permRepo.findByCode.mockResolvedValue(perm({}));

    await expect(
      service.create({
        permissionName: 'x',
        permissionCode: 'p',
        permissionType: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to delete a permission that is still bound', async () => {
    permRepo.findById.mockResolvedValue(perm({ id: '9' }));
    permRepo.countChildren.mockResolvedValue(0);
    permRepo.countRoleBindings.mockResolvedValue(1);
    permRepo.countUserBindings.mockResolvedValue(0);

    await expect(service.delete('9')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(permRepo.save).not.toHaveBeenCalled();
  });

  it('replaces role permissions after validating the ids', async () => {
    roleRepo.findById.mockResolvedValue({ id: 'r1' });
    permRepo.findActiveByIds.mockResolvedValue([perm({ id: 'a' })]);

    await expect(
      service.assignRolePermissions('r1', { permissionIds: ['a', 'b'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(permRepo.deleteRolePermissions).not.toHaveBeenCalled();

    permRepo.findActiveByIds.mockResolvedValue([
      perm({ id: 'a' }),
      perm({ id: 'b' }),
    ]);
    await expect(
      service.assignRolePermissions('r1', { permissionIds: ['a', 'b'] }),
    ).resolves.toEqual(['a', 'b']);
    expect(permRepo.deleteRolePermissions).toHaveBeenCalledWith('r1');
    expect(permRepo.saveRolePermission).toHaveBeenCalledTimes(2);
  });
});
