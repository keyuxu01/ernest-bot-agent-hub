import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import { SEED_TEAM_IDS } from './constants/team.constants';
import type {
  CreateTeamDto,
  QueryTeamDto,
  UpdateTeamDto,
} from './dto/team.dto';
import type { TeamEntity } from './entities/team.entity';
import { TeamRepository } from './repository/team.repository';
import type { TeamTreeNode } from './type/team.types';

/** 团队管理：团队树、增删改查与成员维护；数据访问经 TeamRepository */
@Injectable()
class TeamService {
  /**
   * @description 注入团队数据访问层
   * @param teamRepo TeamRepository，团队与成员的读写
   */
  constructor(private readonly teamRepo: TeamRepository) {}

  /**
   * @description 查询当前用户可访问的团队 ID：成员身份与负责人身份取并集，并过滤已软删团队
   * @param userId string，用户 ID
   * @returns Promise<string[]>，去重后的未删除团队 ID
   */
  async listAccessibleTeamIds(userId: string): Promise<string[]> {
    const [memberTeamIds, ledTeams] = await Promise.all([
      this.teamRepo.findMemberTeamIds(userId),
      this.teamRepo.findLedTeams(userId),
    ]);
    const ids = [
      ...new Set([...memberTeamIds, ...ledTeams.map((team) => team.id)]),
    ];
    const teams = await this.teamRepo.findActiveByIds(ids);
    return teams.map((team) => team.id);
  }

  /**
   * @description 查询当前用户所在或负责的未删除团队
   * @param userId string，当前用户 ID
   * @returns Promise<TeamEntity[]>，按团队排序和创建时间升序排列
   */
  async listMine(userId: string): Promise<TeamEntity[]> {
    const ids = await this.listAccessibleTeamIds(userId);
    return this.teamRepo.findActiveByIds(ids);
  }

  /**
   * @description 新建团队（不校验父团队、负责人是否存在，负责人也不会写进成员表）
   * @param dto CreateTeamDto，团队名称必填；编码、描述、负责人、父团队、排序、状态可选
   * @returns Promise<TeamEntity>，新建的团队
   */
  async create(dto: CreateTeamDto) {
    return this.teamRepo.create({
      id: nextSnowflakeId(),
      teamName: dto.teamName,
      teamCode: dto.teamCode ?? null,
      description: dto.description ?? null,
      leaderId: dto.leaderId ?? null,
      parentId: dto.parentId ?? '0',
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
    });
  }

  /**
   * @description 修改团队；只改传了的字段，父团队不能是自己
   * @param id string，要修改的团队 ID
   * @param dto UpdateTeamDto，要修改的字段，都可选
   * @returns Promise<TeamEntity>，修改后的团队
   * @throws NotFoundException 团队不存在；BadRequestException 父团队是自己
   */
  async update(id: string, dto: UpdateTeamDto) {
    const team = await this.findByIdOrThrow(id);
    if (dto.teamName !== undefined) team.teamName = dto.teamName;
    if (dto.teamCode !== undefined) team.teamCode = dto.teamCode;
    if (dto.description !== undefined) team.description = dto.description;
    if (dto.leaderId !== undefined) team.leaderId = dto.leaderId;
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('父团队不能是自己');
      }
      team.parentId = dto.parentId;
    }
    if (dto.sort !== undefined) team.sort = dto.sort;
    if (dto.status !== undefined) team.status = dto.status;
    return this.teamRepo.save(team);
  }

  /**
   * @description 软删团队并物理删除它的全部成员；有子团队时拒绝
   * @param id string，要删除的团队 ID
   * @returns Promise<void>，无返回值
   * @throws NotFoundException 团队不存在；BadRequestException 存在子团队
   */
  async delete(id: string) {
    const team = await this.findByIdOrThrow(id);
    const childCount = await this.teamRepo.countChildren(id);
    if (childCount > 0) {
      throw new BadRequestException('存在子团队，无法删除');
    }
    team.deleted = true;
    await this.teamRepo.save(team);
    await this.teamRepo.deleteAllMembers(id);
  }

  /**
   * @description 取团队详情，附带成员数
   * @param id string，团队 ID
   * @returns Promise<TeamEntity & { memberCount: number }>，团队字段加 memberCount
   * @throws NotFoundException 团队不存在
   */
  async getDetail(id: string) {
    const team = await this.findByIdOrThrow(id);
    const memberCount = await this.teamRepo.countMembers(id);
    return { ...team, memberCount };
  }

  /**
   * @description 分页查询团队，可按关键字、状态筛选
   * @param query QueryTeamDto，keyword、status 可选；page 默认 1；pageSize 默认 20，最大 100
   * @returns Promise<{ items: TeamEntity[]; total: number; page: number; pageSize: number }>，当前页数据、总条数和分页参数
   */
  async page(query: QueryTeamDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { items, total } = await this.teamRepo.findPage({
      keyword: query.keyword,
      status: query.status,
      page,
      pageSize,
    });
    return { items, total, page, pageSize };
  }

  /**
   * @description 把可用团队按 parent_id 组装成树
   * @param rootOnly boolean，默认 false；true 时只返回根团队（不带 children 字段）
   * @returns Promise<TeamEntity[] | TeamTreeNode[]>，rootOnly 时为根团队数组，否则为带 children 的树
   */
  async getTree(rootOnly = false): Promise<TeamEntity[] | TeamTreeNode[]> {
    const teams = await this.teamRepo.findAllActive();
    /**
     * @description 递归取某个团队的子团队，并继续往下组装
     * @param parentId string，父团队 ID
     * @returns TeamTreeNode[]，该父团队下的子树
     */
    const build = (parentId: string): TeamTreeNode[] =>
      teams
        .filter((t) => t.parentId === parentId)
        .map((t) => ({
          ...t,
          children: rootOnly ? [] : build(t.id),
        }));
    const rootNodes = teams.filter((t) => !t.parentId || t.parentId === '0');
    return rootOnly
      ? rootNodes
      : rootNodes.map((t) => ({
          ...t,
          children: build(t.id),
        }));
  }

  /**
   * @description 批量加成员，身份为 member；已在团队里的用户跳过
   * @param teamId string，团队 ID
   * @param userIds string[]，要加入的用户 ID 数组，必须全部存在且未删除
   * @returns Promise<boolean>，成功返回 true
   * @throws NotFoundException 团队不存在，或有用户不存在
   */
  async addMembers(teamId: string, userIds: string[]) {
    await this.findByIdOrThrow(teamId);
    const users = await this.teamRepo.findActiveUsersByIds(userIds);
    if (users.length !== userIds.length) {
      throw new NotFoundException('部分用户不存在');
    }
    for (const userId of userIds) {
      const exists = await this.teamRepo.findMember(teamId, userId);
      if (exists) continue;
      await this.teamRepo.saveMember({
        id: nextSnowflakeId(),
        teamId,
        userId,
        memberRole: 'member',
      });
    }
    return true;
  }

  /**
   * @description 批量移除成员（不在团队里的 ID 忽略）
   * @param teamId string，团队 ID
   * @param userIds string[]，要移除的用户 ID 数组
   * @returns Promise<boolean>，成功返回 true
   * @throws NotFoundException 团队不存在
   */
  async removeMembers(teamId: string, userIds: string[]) {
    await this.findByIdOrThrow(teamId);
    await this.teamRepo.deleteMembers(teamId, userIds);
    return true;
  }

  /**
   * @description 列出团队成员及其用户名、显示名
   * @param teamId string，团队 ID
   * @returns Promise<TeamMemberVO[]>，成员数组，每项含 userId、memberRole、username、realName
   * @throws NotFoundException 团队不存在
   */
  async listMembers(teamId: string) {
    await this.findByIdOrThrow(teamId);
    return this.teamRepo.listMembers(teamId);
  }

  /**
   * @description 让初始管理员担任 init 预置团队（SEED_TEAM_IDS）的负责人：写 leader_id 并插入 leader 成员行。
   * 只在初始管理员新建时调用；团队已有负责人则不改负责人，已是成员则不重复插入
   * @param userId string，初始管理员的用户 ID
   * @returns Promise<void>，无返回值
   */
  async assignSeedTeamLeader(userId: string): Promise<void> {
    for (const teamId of SEED_TEAM_IDS) {
      const team = await this.teamRepo.findById(teamId);
      if (!team) continue;
      if (!team.leaderId) {
        team.leaderId = userId;
        await this.teamRepo.save(team);
      }
      if (await this.teamRepo.findMember(teamId, userId)) continue;
      await this.teamRepo.saveMember({
        id: nextSnowflakeId(),
        teamId,
        userId,
        memberRole: 'leader',
      });
    }
  }

  /**
   * @description 按 ID 取未删除的团队，不存在时抛 404
   * @param id string，团队 ID
   * @returns Promise<TeamEntity>，团队实体
   * @throws NotFoundException 团队不存在或已删除
   */
  private async findByIdOrThrow(id: string): Promise<TeamEntity> {
    const team = await this.teamRepo.findById(id);
    if (!team) throw new NotFoundException('团队不存在');
    return team;
  }
}

export { TeamService };
