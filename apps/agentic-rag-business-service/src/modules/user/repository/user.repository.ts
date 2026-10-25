import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { UserEntity } from '../entities/user.entity';

/**
 * PostgreSQL `kh_user` / `kh_role` / `kh_user_role` 数据访问
 *
 * 按项目约定 Service 不直接注入 TypeORM Repository，统一经这里访问。
 */
@Injectable()
class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
  ) {}

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({
      where: { username, deleted: false },
    });
  }

  async findById(userId: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({
      where: { id: userId, deleted: false },
    });
  }

  async getRoleCodes(userId: string): Promise<string[]> {
    const rows = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin(RoleEntity, 'r', 'r.id = ur.role_id')
      .where('ur.user_id = :userId', { userId })
      .andWhere('r.status = 1')
      .select('r.role_code', 'roleCode')
      .getRawMany<{ roleCode: string }>();
    return rows.map((r) => r.roleCode);
  }

  async saveUser(input: Partial<UserEntity>): Promise<UserEntity> {
    return this.userRepo.save(this.userRepo.create(input));
  }

  async findRoleByCode(roleCode: string): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({ where: { roleCode } });
  }

  async findUserRole(
    userId: string,
    roleId: string,
  ): Promise<UserRoleEntity | null> {
    return this.userRoleRepo.findOne({ where: { userId, roleId } });
  }

  async saveUserRole(input: Partial<UserRoleEntity>): Promise<void> {
    await this.userRoleRepo.save(this.userRoleRepo.create(input));
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.userRepo.update(userId, { lastLoginAt: new Date() });
  }

  async getUserIdsByRoleCode(roleCode: string): Promise<string[]> {
    const rows = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin(RoleEntity, 'r', 'r.id = ur.role_id')
      .innerJoin(UserEntity, 'u', 'u.id = ur.user_id')
      .where('r.role_code = :roleCode', { roleCode })
      .andWhere('u.deleted = false')
      .andWhere('u.status = 1')
      .select('u.id', 'userId')
      .getRawMany<{ userId: string }>();
    return rows.map((r) => String(r.userId));
  }
}

export { UserRepository };
