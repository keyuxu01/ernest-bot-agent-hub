import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';

/** PostgreSQL `kh_role` 数据访问（角色管理） */
@Injectable()
class RoleRepository {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
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

  /** 物理删除角色 */
  async remove(role: RoleEntity): Promise<void> {
    await this.roleRepo.remove(role);
  }

  /** 绑定了该角色的用户数 */
  async countUserBindings(roleId: string): Promise<number> {
    return this.userRoleRepo.count({ where: { roleId } });
  }
}

export { RoleRepository };
