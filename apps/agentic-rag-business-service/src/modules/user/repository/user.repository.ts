import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { UserEntity } from '../entities/user.entity';
import type { UserPageQuery } from '../type/user.types';

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

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { email, deleted: false } });
  }

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

  /** 新建用户（由入参装配实体后落库） */
  async saveUser(input: Partial<UserEntity>): Promise<UserEntity> {
    return this.userRepo.save(this.userRepo.create(input));
  }

  /** 持久化已加载的用户（更新场景） */
  async save(user: UserEntity): Promise<UserEntity> {
    return this.userRepo.save(user);
  }

  async findRoleByCode(roleCode: string): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({ where: { roleCode } });
  }

  /** 按编码查启用状态的角色 */
  async findActiveRolesByCodes(roleCodes: string[]): Promise<RoleEntity[]> {
    return this.roleRepo.find({
      where: { roleCode: In(roleCodes), status: 1 },
    });
  }

  async findAllActiveRoles(): Promise<RoleEntity[]> {
    return this.roleRepo.find({
      where: { status: 1 },
      order: { roleName: 'ASC' },
    });
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

  async deleteUserRoles(userId: string): Promise<void> {
    await this.userRoleRepo.delete({ userId });
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

  /** 分页列表：关键字匹配用户名 / 显示名 / 邮箱，可按状态、角色编码筛选 */
  async findPage(
    query: UserPageQuery,
  ): Promise<{ users: UserEntity[]; total: number }> {
    const qb = this.userRepo.createQueryBuilder('u').where('u.deleted = false');

    if (query.keyword?.trim()) {
      const kw = `%${query.keyword.trim()}%`;
      qb.andWhere(
        '(u.username ILIKE :kw OR u.real_name ILIKE :kw OR u.email ILIKE :kw)',
        { kw },
      );
    }
    if (query.status !== undefined) {
      qb.andWhere('u.status = :status', { status: query.status });
    }
    if (query.roleCode) {
      qb.innerJoin(UserRoleEntity, 'ur', 'ur.user_id = u.id').innerJoin(
        RoleEntity,
        'r',
        'r.id = ur.role_id AND r.role_code = :roleCode',
        { roleCode: query.roleCode },
      );
    }

    qb.orderBy('u.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [users, total] = await qb.getManyAndCount();
    return { users, total };
  }
}

export { UserRepository };
