import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { UserPermissionEntity } from '../entities/user-permission.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import type { PermissionPageQuery } from '../type/user.types';

/**
 * PostgreSQL `kh_permission` / `kh_role_permission` / `kh_user_permission` 数据访问
 *
 * 权限软删（deleted）；生效权限只取 status = 1 且未删除的行。
 * 角色 / 用户的权限绑定为物理行，替换时先删后插（不在同一事务）。
 */
@Injectable()
class PermissionRepository {
  /**
   * @description 注入三张权限相关表和用户-角色表的 TypeORM Repository
   * @param permRepo Repository<PermissionEntity>，操作 kh_permission（权限本身）
   * @param rolePermRepo Repository<RolePermissionEntity>，操作 kh_role_permission（角色绑了哪些权限）
   * @param userPermRepo Repository<UserPermissionEntity>，操作 kh_user_permission（用户直接绑了哪些权限）
   * @param userRoleRepo Repository<UserRoleEntity>，操作 kh_user_role（用户有哪些角色），用于查角色带来的权限
   */
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermRepo: Repository<RolePermissionEntity>,
    @InjectRepository(UserPermissionEntity)
    private readonly userPermRepo: Repository<UserPermissionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
  ) {}

  /**
   * @description 查全部可用权限（启用且未删除），用于权限列表和构建权限树
   * @returns Promise<PermissionEntity[]>，权限数组，按 sort 升序、同 sort 按创建时间升序
   */
  async findAllActive(): Promise<PermissionEntity[]> {
    // SQL：SELECT * FROM kh_permission
    return this.permRepo.find({
      // WHERE deleted = false AND status = 1（未删除且启用）
      where: { deleted: false, status: 1 },
      // ORDER BY sort ASC, created_at ASC
      order: { sort: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * @description 按 ID 查一条未删除的权限（不管启用还是禁用）
   * @param id string，权限 ID（雪花 ID 字符串）
   * @returns Promise<PermissionEntity | null>，找到返回权限，不存在或已删除返回 null
   */
  async findById(id: string): Promise<PermissionEntity | null> {
    // SQL：SELECT * FROM kh_permission WHERE id = :id AND deleted = false LIMIT 1
    return this.permRepo.findOne({ where: { id, deleted: false } });
  }

  /**
   * @description 查某个权限下的直接子权限（只查一层，启用且未删除）
   * @param parentId string，父权限 ID；传 '0' 表示查根节点
   * @returns Promise<PermissionEntity[]>，子权限数组，按 sort 升序
   */
  async findActiveChildren(parentId: string): Promise<PermissionEntity[]> {
    // SQL：SELECT * FROM kh_permission
    return this.permRepo.find({
      // WHERE parent_id = :parentId AND deleted = false AND status = 1
      where: { parentId, deleted: false, status: 1 },
      // ORDER BY sort ASC
      order: { sort: 'ASC' },
    });
  }

  /**
   * @description 按权限编码查一条未删除的权限，用于新建 / 修改时判断编码是否重复
   * @param permissionCode string，权限编码，如 'document:list'
   * @returns Promise<PermissionEntity | null>，找到返回权限，没有返回 null
   */
  async findByCode(permissionCode: string): Promise<PermissionEntity | null> {
    // SQL：SELECT * FROM kh_permission
    return this.permRepo.findOne({
      // WHERE permission_code = :permissionCode AND deleted = false LIMIT 1
      where: { permissionCode, deleted: false },
    });
  }

  /**
   * @description 按一组 ID 查启用且未删除的权限，用于绑定前校验传入的权限 ID 是否都有效
   * @param ids string[]，权限 ID 数组
   * @returns Promise<PermissionEntity[]>，查到的有效权限；数量少于 ids 说明有无效 ID
   */
  async findActiveByIds(ids: string[]): Promise<PermissionEntity[]> {
    // SQL：SELECT * FROM kh_permission
    return this.permRepo.find({
      // WHERE id IN (:...ids) AND deleted = false AND status = 1
      where: { id: In(ids), deleted: false, status: 1 },
    });
  }

  /**
   * @description 新建一条权限
   * @param input Partial<PermissionEntity>，权限字段（id、编码、名称、类型等），未给的字段用列默认值
   * @returns Promise<PermissionEntity>，落库后的权限（含数据库生成的 created_at / updated_at）
   */
  async create(input: Partial<PermissionEntity>): Promise<PermissionEntity> {
    // create：把普通对象转成实体对象（不访问数据库）
    // save：SQL INSERT INTO kh_permission (...) VALUES (...)
    return this.permRepo.save(this.permRepo.create(input));
  }

  /**
   * @description 保存一条已加载并修改过的权限（修改字段、软删都走这里）
   * @param perm PermissionEntity，先查出来再改过的权限实体
   * @returns Promise<PermissionEntity>，保存后的权限
   */
  async save(perm: PermissionEntity): Promise<PermissionEntity> {
    // 主键已存在：SQL UPDATE kh_permission SET <改动的列>, updated_at = NOW() WHERE id = :id
    return this.permRepo.save(perm);
  }

  /**
   * @description 统计某个权限下未删除的直接子权限数，删除权限前用来判断是否还有子权限
   * @param parentId string，父权限 ID
   * @returns Promise<number>，子权限数量
   */
  async countChildren(parentId: string): Promise<number> {
    // SQL：SELECT COUNT(*) FROM kh_permission WHERE parent_id = :parentId AND deleted = false
    return this.permRepo.count({ where: { parentId, deleted: false } });
  }

  /**
   * @description 统计有多少个角色绑了这个权限，删除权限前用来判断是否还在使用
   * @param permissionId string，权限 ID
   * @returns Promise<number>，绑定的角色数
   */
  async countRoleBindings(permissionId: string): Promise<number> {
    // SQL：SELECT COUNT(*) FROM kh_role_permission WHERE permission_id = :permissionId
    return this.rolePermRepo.count({ where: { permissionId } });
  }

  /**
   * @description 统计有多少个用户直接绑了这个权限，删除权限前用来判断是否还在使用
   * @param permissionId string，权限 ID
   * @returns Promise<number>，绑定的用户数
   */
  async countUserBindings(permissionId: string): Promise<number> {
    // SQL：SELECT COUNT(*) FROM kh_user_permission WHERE permission_id = :permissionId
    return this.userPermRepo.count({ where: { permissionId } });
  }

  /**
   * @description 分页查询未删除的权限，可按关键字模糊匹配名称或编码（含禁用的权限）
   * @param query PermissionPageQuery，keyword 为可选关键字，page 为页码（从 1 开始），pageSize 为每页条数
   * @returns Promise<{ items: PermissionEntity[]; total: number }>，items 为当前页数据，total 为符合条件的总条数
   */
  async findPage(
    query: PermissionPageQuery,
  ): Promise<{ items: PermissionEntity[]; total: number }> {
    // SELECT p.* FROM kh_permission p WHERE p.deleted = false
    const qb = this.permRepo.createQueryBuilder('p').where('p.deleted = false');
    if (query.keyword?.trim()) {
      // AND (p.permission_name ILIKE '%关键字%' OR p.permission_code ILIKE '%关键字%')
      // ILIKE 是 PostgreSQL 的不区分大小写模糊匹配；:kw 是参数占位，防 SQL 注入
      qb.andWhere(
        '(p.permission_name ILIKE :kw OR p.permission_code ILIKE :kw)',
        { kw: `%${query.keyword.trim()}%` },
      );
    }
    // ORDER BY p.sort ASC
    qb.orderBy('p.sort', 'ASC')
      // , p.created_at ASC
      .addOrderBy('p.created_at', 'ASC')
      // OFFSET (page - 1) * pageSize：跳过前面几页
      .skip((query.page - 1) * query.pageSize)
      // LIMIT pageSize：只取一页
      .take(query.pageSize);
    // 同时执行「查当前页」和「SELECT COUNT(*) 查总数」两条 SQL
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * @description 查某个角色绑定的全部权限 ID
   * @param roleId string，角色 ID
   * @returns Promise<string[]>，权限 ID 数组
   */
  async findRolePermissionIds(roleId: string): Promise<string[]> {
    // SQL：SELECT * FROM kh_role_permission WHERE role_id = :roleId
    const rows = await this.rolePermRepo.find({ where: { roleId } });
    // 只取每行的 permission_id
    return rows.map((r) => r.permissionId);
  }

  /**
   * @description 删除某个角色的全部权限绑定（全量替换的第一步）
   * @param roleId string，角色 ID
   * @returns Promise<void>，无返回值
   */
  async deleteRolePermissions(roleId: string): Promise<void> {
    // SQL：DELETE FROM kh_role_permission WHERE role_id = :roleId（物理删除）
    await this.rolePermRepo.delete({ roleId });
  }

  /**
   * @description 新增一条角色-权限绑定（全量替换的第二步，逐条插入）
   * @param input Partial<RolePermissionEntity>，包含 id、roleId、permissionId
   * @returns Promise<void>，无返回值
   */
  async saveRolePermission(
    input: Partial<RolePermissionEntity>,
  ): Promise<void> {
    // SQL：INSERT INTO kh_role_permission (id, role_id, permission_id) VALUES (...)
    await this.rolePermRepo.save(this.rolePermRepo.create(input));
  }

  /**
   * @description 查某个用户直接绑定的全部权限 ID（不含角色带来的权限）
   * @param userId string，用户 ID
   * @returns Promise<string[]>，权限 ID 数组
   */
  async findUserPermissionIds(userId: string): Promise<string[]> {
    // SQL：SELECT * FROM kh_user_permission WHERE user_id = :userId
    const rows = await this.userPermRepo.find({ where: { userId } });
    // 只取每行的 permission_id
    return rows.map((r) => r.permissionId);
  }

  /**
   * @description 删除某个用户的全部直接权限绑定（全量替换的第一步）
   * @param userId string，用户 ID
   * @returns Promise<void>，无返回值
   */
  async deleteUserPermissions(userId: string): Promise<void> {
    // SQL：DELETE FROM kh_user_permission WHERE user_id = :userId（物理删除）
    await this.userPermRepo.delete({ userId });
  }

  /**
   * @description 新增一条用户-权限直接绑定（全量替换的第二步，逐条插入）
   * @param input Partial<UserPermissionEntity>，包含 id、userId、permissionId
   * @returns Promise<void>，无返回值
   */
  async saveUserPermission(
    input: Partial<UserPermissionEntity>,
  ): Promise<void> {
    // SQL：INSERT INTO kh_user_permission (id, user_id, permission_id) VALUES (...)
    await this.userPermRepo.save(this.userPermRepo.create(input));
  }

  /**
   * @description 查用户直接绑定、且仍然有效（启用、未删除）的权限编码
   * @param userId string，用户 ID
   * @returns Promise<string[]>，权限编码数组，如 ['document:create']
   */
  async findUserDirectPermissionCodes(userId: string): Promise<string[]> {
    const rows = await this.userPermRepo
      // FROM kh_user_permission up
      .createQueryBuilder('up')
      // INNER JOIN kh_permission p ON p.id = up.permission_id（关联出权限本身，拿编码和状态）
      .innerJoin(PermissionEntity, 'p', 'p.id = up.permission_id')
      // WHERE up.user_id = :userId（只看这个用户）
      .where('up.user_id = :userId', { userId })
      // AND p.status = 1（权限启用）
      .andWhere('p.status = 1')
      // AND p.deleted = false（权限未删除）
      .andWhere('p.deleted = false')
      // SELECT p.permission_code AS code（只要编码这一列）
      .select('p.permission_code', 'code')
      // 返回原始行 [{ code: '...' }]，不转成实体
      .getRawMany<{ code: string }>();
    return rows.map((r) => r.code);
  }

  /**
   * @description 查用户通过角色获得、且仍然有效（启用、未删除）的权限编码
   * @param userId string，用户 ID
   * @returns Promise<string[]>，去重后的权限编码数组
   */
  async findUserRolePermissionCodes(userId: string): Promise<string[]> {
    const rows = await this.userRoleRepo
      // FROM kh_user_role ur（用户有哪些角色）
      .createQueryBuilder('ur')
      // INNER JOIN kh_role_permission rp ON rp.role_id = ur.role_id（这些角色绑了哪些权限）
      .innerJoin(RolePermissionEntity, 'rp', 'rp.role_id = ur.role_id')
      // INNER JOIN kh_permission p ON p.id = rp.permission_id（关联出权限本身）
      .innerJoin(PermissionEntity, 'p', 'p.id = rp.permission_id')
      // WHERE ur.user_id = :userId（只看这个用户的角色）
      .where('ur.user_id = :userId', { userId })
      // AND p.status = 1（权限启用）
      .andWhere('p.status = 1')
      // AND p.deleted = false（权限未删除）
      .andWhere('p.deleted = false')
      // SELECT DISTINCT p.permission_code AS code（多个角色绑同一权限时只返回一次）
      .select('DISTINCT p.permission_code', 'code')
      // 返回原始行 [{ code: '...' }]
      .getRawMany<{ code: string }>();
    return rows.map((r) => r.code);
  }
}

export { PermissionRepository };
