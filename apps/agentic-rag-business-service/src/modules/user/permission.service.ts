import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import {
  ADMIN_OPERATION_PERMISSIONS,
  ADMIN_ROLES,
} from './constants/permission.constants';
import type {
  AssignPermissionIdsDto,
  CreatePermissionDto,
  QueryPermissionDto,
  UpdatePermissionDto,
} from './dto/permission.dto';
import { PermissionRepository } from './repository/permission.repository';
import { RoleRepository } from './repository/role.repository';
import { UserRepository } from './repository/user.repository';
import type { PermissionTreeNode } from './type/user.types';

/**
 * 权限管理与生效权限计算
 *
 * 生效权限 = 用户直接权限 ∪ 角色权限（仅启用且未删除的权限），
 * 持有 ADMIN_ROLES 的用户再追加 ADMIN_OPERATION_PERMISSIONS。
 */
@Injectable()
class PermissionService {
  /**
   * @description 注入权限、角色、用户三个数据访问层
   * @param permRepo PermissionRepository，权限及角色 / 用户权限绑定的读写
   * @param roleRepo RoleRepository，绑权限前校验角色是否存在
   * @param userRepo UserRepository，查用户的角色编码，判断是否管理员
   */
  constructor(
    private readonly permRepo: PermissionRepository,
    private readonly roleRepo: RoleRepository,
    private readonly userRepo: UserRepository,
  ) {}

  /**
   * @description 列出全部可用权限（平铺，不分层）
   * @returns Promise<PermissionEntity[]>，启用且未删除的权限，按 sort、创建时间升序
   */
  async listAll() {
    return this.permRepo.findAllActive();
  }

  /**
   * @description 按 ID 取一个权限，不存在时抛 404
   * @param id string，权限 ID
   * @returns Promise<PermissionEntity>，权限实体
   * @throws NotFoundException 权限不存在或已删除
   */
  async getById(id: string) {
    const perm = await this.permRepo.findById(id);
    if (!perm) throw new NotFoundException('权限不存在');
    return perm;
  }

  /**
   * @description 取某个权限下的直接子权限（只取一层）
   * @param parentId string，父权限 ID；'0' 表示根
   * @returns Promise<PermissionEntity[]>，启用且未删除的子权限，按 sort 升序
   */
  async getChildren(parentId: string) {
    return this.permRepo.findActiveChildren(parentId);
  }

  /**
   * @description 新建权限；编码不能与未删除的权限重复
   * @param dto CreatePermissionDto，权限名称、编码、类型必填；父权限、菜单路径、图标、排序、状态等可选
   * @returns Promise<PermissionEntity>，新建的权限
   * @throws ConflictException 权限编码已存在
   */
  async create(dto: CreatePermissionDto) {
    const exists = await this.permRepo.findByCode(dto.permissionCode);
    if (exists) throw new ConflictException('权限编码已存在');
    return this.permRepo.create({
      id: nextSnowflakeId(),
      parentId: dto.parentId ?? '0',
      permissionName: dto.permissionName,
      permissionCode: dto.permissionCode,
      permissionType: dto.permissionType,
      menuUrl: dto.menuUrl ?? null,
      apiUrl: dto.apiUrl ?? null,
      method: dto.method ?? null,
      icon: dto.icon ?? null,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
    });
  }

  /**
   * @description 修改权限；只改传了的字段，改编码时校验不重复，父权限不能是自己
   * @param id string，要修改的权限 ID
   * @param dto UpdatePermissionDto，要修改的字段，都可选
   * @returns Promise<PermissionEntity>，修改后的权限
   * @throws NotFoundException 权限不存在；ConflictException 新编码已存在；BadRequestException 父权限是自己
   */
  async update(id: string, dto: UpdatePermissionDto) {
    const perm = await this.getById(id);
    if (dto.permissionCode && dto.permissionCode !== perm.permissionCode) {
      const exists = await this.permRepo.findByCode(dto.permissionCode);
      if (exists) throw new ConflictException('权限编码已存在');
      perm.permissionCode = dto.permissionCode;
    }
    if (dto.permissionName !== undefined)
      perm.permissionName = dto.permissionName;
    if (dto.permissionType !== undefined)
      perm.permissionType = dto.permissionType;
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('父权限不能是自己');
      }
      perm.parentId = dto.parentId;
    }
    if (dto.menuUrl !== undefined) perm.menuUrl = dto.menuUrl;
    if (dto.apiUrl !== undefined) perm.apiUrl = dto.apiUrl;
    if (dto.method !== undefined) perm.method = dto.method;
    if (dto.icon !== undefined) perm.icon = dto.icon;
    if (dto.sort !== undefined) perm.sort = dto.sort;
    if (dto.status !== undefined) perm.status = dto.status;
    return this.permRepo.save(perm);
  }

  /**
   * @description 软删权限；有子权限或仍被角色 / 用户绑定时拒绝
   * @param id string，要删除的权限 ID
   * @returns Promise<void>，无返回值
   * @throws NotFoundException 权限不存在；BadRequestException 有子权限或仍有绑定
   */
  async delete(id: string) {
    const perm = await this.getById(id);
    const childCount = await this.permRepo.countChildren(id);
    if (childCount > 0) {
      throw new BadRequestException('存在子权限，无法删除');
    }
    const roleBound = await this.permRepo.countRoleBindings(id);
    const userBound = await this.permRepo.countUserBindings(id);
    if (roleBound > 0 || userBound > 0) {
      throw new BadRequestException('权限仍有关联角色或用户，无法删除');
    }
    perm.deleted = true;
    await this.permRepo.save(perm);
  }

  /**
   * @description 分页查询权限，可按关键字匹配名称或编码
   * @param query QueryPermissionDto，keyword 可选；page 默认 1；pageSize 默认 20，最大 100
   * @returns Promise<{ items: PermissionEntity[]; total: number; page: number; pageSize: number }>，当前页数据、总条数和分页参数
   */
  async page(query: QueryPermissionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { items, total } = await this.permRepo.findPage({
      keyword: query.keyword,
      page,
      pageSize,
    });
    return { items, total, page, pageSize };
  }

  /**
   * @description 把全部可用权限按 parent_id 组装成树
   * @returns Promise<PermissionTreeNode[]>，根节点数组（parent_id = 0），每个节点的 children 为子节点数组
   */
  async getTree(): Promise<PermissionTreeNode[]> {
    const perms = await this.permRepo.findAllActive();
    /**
     * @description 递归取某个节点的子节点，并继续往下组装
     * @param parentId string，父节点 ID
     * @returns PermissionTreeNode[]，该父节点下的子树
     */
    const build = (parentId: string): PermissionTreeNode[] =>
      perms
        .filter((p) => p.parentId === parentId)
        .map((p) => ({
          ...p,
          children: build(p.id),
        }));
    return build('0');
  }

  /**
   * @description 查某个角色绑定的权限 ID
   * @param roleId string，角色 ID
   * @returns Promise<string[]>，权限 ID 数组
   * @throws NotFoundException 角色不存在
   */
  async getRolePermissionIds(roleId: string): Promise<string[]> {
    await this.ensureRoleExists(roleId);
    return this.permRepo.findRolePermissionIds(roleId);
  }

  /**
   * @description 全量替换角色的权限：先删光原绑定，再逐条插入新绑定（不在同一事务）
   * @param roleId string，角色 ID
   * @param dto AssignPermissionIdsDto，permissionIds 为新的完整权限 ID 列表，传空数组表示清空
   * @returns Promise<string[]>，替换后的权限 ID 数组（即传入的 permissionIds）
   * @throws NotFoundException 角色不存在，或有权限不存在 / 已禁用
   */
  async assignRolePermissions(roleId: string, dto: AssignPermissionIdsDto) {
    await this.ensureRoleExists(roleId);
    await this.validatePermissionIds(dto.permissionIds);
    await this.permRepo.deleteRolePermissions(roleId);
    for (const permissionId of dto.permissionIds) {
      await this.permRepo.saveRolePermission({
        id: nextSnowflakeId(),
        roleId,
        permissionId,
      });
    }
    return dto.permissionIds;
  }

  /**
   * @description 查用户直接绑定的权限 ID（不含角色带来的权限）
   * @param userId string，用户 ID
   * @returns Promise<string[]>，权限 ID 数组
   */
  async getUserDirectPermissionIds(userId: string): Promise<string[]> {
    return this.permRepo.findUserPermissionIds(userId);
  }

  /**
   * @description 全量替换用户的直接权限：先删光原绑定，再逐条插入新绑定（不在同一事务）
   * @param userId string，用户 ID（调用方负责先校验用户存在）
   * @param dto AssignPermissionIdsDto，permissionIds 为新的完整权限 ID 列表，传空数组表示清空
   * @returns Promise<string[]>，替换后的权限 ID 数组（即传入的 permissionIds）
   * @throws NotFoundException 有权限不存在或已禁用
   */
  async assignUserPermissions(userId: string, dto: AssignPermissionIdsDto) {
    await this.validatePermissionIds(dto.permissionIds);
    await this.permRepo.deleteUserPermissions(userId);
    for (const permissionId of dto.permissionIds) {
      await this.permRepo.saveUserPermission({
        id: nextSnowflakeId(),
        userId,
        permissionId,
      });
    }
    return dto.permissionIds;
  }

  /**
   * @description 计算用户的生效权限编码：直接权限 + 角色权限去重；管理员再追加 ADMIN_OPERATION_PERMISSIONS。
   * 登录和每次请求鉴权（buildAuthUser）都会调用，结果放进 AuthUser.permissions
   * @param userId string，用户 ID
   * @returns Promise<string[]>，去重后的权限编码数组，如 ['document:list', 'search']
   */
  async getUserPermissionCodes(userId: string): Promise<string[]> {
    const direct = await this.permRepo.findUserDirectPermissionCodes(userId);
    const viaRole = await this.permRepo.findUserRolePermissionCodes(userId);
    const set = new Set<string>([...direct, ...viaRole]);

    const roleCodes = await this.userRepo.getRoleCodes(userId);
    const isAdmin = roleCodes.some((code) =>
      (ADMIN_ROLES as readonly string[]).includes(code),
    );
    if (isAdmin) {
      for (const code of ADMIN_OPERATION_PERMISSIONS) {
        set.add(code);
      }
    }
    return [...set];
  }

  /**
   * @description 校验角色存在
   * @param roleId string，角色 ID
   * @returns Promise<void>，存在时正常返回
   * @throws NotFoundException 角色不存在
   */
  private async ensureRoleExists(roleId: string) {
    const role = await this.roleRepo.findById(roleId);
    if (!role) throw new NotFoundException('角色不存在');
  }

  /**
   * @description 校验一组权限 ID 都存在、启用且未删除；空数组直接通过
   * @param ids string[]，权限 ID 数组
   * @returns Promise<void>，全部有效时正常返回
   * @throws NotFoundException 有任意一个权限不存在或已禁用
   */
  private async validatePermissionIds(ids: string[]) {
    if (!ids.length) return;
    const found = await this.permRepo.findActiveByIds(ids);
    if (found.length !== ids.length) {
      throw new NotFoundException('部分权限不存在或已禁用');
    }
  }
}

export { PermissionService };
