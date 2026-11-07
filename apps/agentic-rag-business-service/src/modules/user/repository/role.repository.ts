import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';

/** PostgreSQL `kh_role` 数据访问（角色管理） */
@Injectable()
class RoleRepository {
  /**
   * @description 注入角色、用户角色和角色权限表的 TypeORM Repository。
   * @param roleRepo Repository<RoleEntity>，操作 kh_role。
   * @param userRoleRepo Repository<UserRoleEntity>，操作 kh_user_role。
   * @param rolePermissionRepo Repository<RolePermissionEntity>，操作 kh_role_permission。
   */
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
  ) {}

  async findAllActive(): Promise<RoleEntity[]> {
    return this.roleRepo.find({
      where: { status: 1 },
      order: { roleName: 'ASC' },
    });
  }

  async findById(id: string): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({ where: { id } });
  }

  async findByCode(roleCode: string): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({ where: { roleCode } });
  }

  /** 新建角色（由入参装配实体后落库） */
  async create(input: Partial<RoleEntity>): Promise<RoleEntity> {
    return this.roleRepo.save(this.roleRepo.create(input));
  }

  async save(role: RoleEntity): Promise<RoleEntity> {
    return this.roleRepo.save(role);
  }

  /**
   * @description 物理删除角色；先删除角色权限关联，避免 kh_role_permission 外键阻止角色删除。
   * @param role RoleEntity，要删除的角色实体。
   * @returns Promise<void>，删除完成后无返回值。
   */
  async remove(role: RoleEntity): Promise<void> {
    // SQL：DELETE FROM kh_role_permission WHERE role_id = :roleId
    await this.rolePermissionRepo.delete({ roleId: role.id });
    // SQL：DELETE FROM kh_role WHERE id = :id
    await this.roleRepo.remove(role);
  }

  /** 绑定了该角色的用户数 */
  async countUserBindings(roleId: string): Promise<number> {
    return this.userRoleRepo.count({ where: { roleId } });
  }
}

export { RoleRepository };
