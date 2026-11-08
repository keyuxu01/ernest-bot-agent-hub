import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { TeamMemberEntity } from '../entities/team-member.entity';
import { TeamEntity } from '../entities/team.entity';
import type { TeamMemberVO, TeamPageQuery } from '../type/team.types';

/**
 * PostgreSQL `kh_team` / `kh_team_member` 数据访问；成员校验与列表关联 `kh_user`
 *
 * 团队软删（deleted）；成员为物理行，删除团队时一并物理删除。
 */
@Injectable()
class TeamRepository {
  /**
   * @description 注入团队、团队成员、用户三张表的 TypeORM Repository
   * @param teamRepo Repository<TeamEntity>，操作 kh_team（团队）
   * @param memberRepo Repository<TeamMemberEntity>，操作 kh_team_member（团队里有哪些用户）
   * @param userRepo Repository<UserEntity>，操作 kh_user，用于加成员前校验用户存在
   */
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly memberRepo: Repository<TeamMemberEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /**
   * @description 查询用户作为成员加入的全部团队 ID
   * @param userId string，用户 ID
   * @returns Promise<string[]>，成员表中的团队 ID
   */
  async findMemberTeamIds(userId: string): Promise<string[]> {
    // SELECT m.team_id AS "teamId" FROM kh_team_member m WHERE m.user_id = :userId
    const rows = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.team_id', 'teamId')
      .where('m.user_id = :userId', { userId })
      .getRawMany<{ teamId: string | number }>();
    return rows.map((row) => String(row.teamId));
  }

  /**
   * @description 查询用户担任负责人的全部未删除团队
   * @param userId string，用户 ID
   * @returns Promise<TeamEntity[]>，负责人团队
   */
  async findLedTeams(userId: string): Promise<TeamEntity[]> {
    // SELECT id FROM kh_team WHERE leader_id = :userId AND deleted = false
    return this.teamRepo.find({
      where: { leaderId: userId, deleted: false },
      select: { id: true },
    });
  }

  /**
   * @description 按 ID 查询未删除团队，过滤成员表可能残留的软删团队
   * @param ids string[]，团队 ID
   * @returns Promise<TeamEntity[]>，未删除团队，按 sort、created_at 升序
   */
  async findActiveByIds(ids: string[]): Promise<TeamEntity[]> {
    if (!ids.length) return [];
    // SELECT * FROM kh_team WHERE id IN (:...ids) AND deleted = false
    // ORDER BY sort ASC, created_at ASC
    return this.teamRepo.find({
      where: { id: In(ids), deleted: false },
      order: { sort: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * @description 新建一个团队
   * @param input Partial<TeamEntity>，团队字段（id、名称、编码、父团队等），未给的字段用列默认值
   * @returns Promise<TeamEntity>，落库后的团队
   */
  async create(input: Partial<TeamEntity>): Promise<TeamEntity> {
    // create：把普通对象转成实体对象（不访问数据库）
    // save：SQL INSERT INTO kh_team (...) VALUES (...)
    return this.teamRepo.save(this.teamRepo.create(input));
  }

  /**
   * @description 保存一个已加载并修改过的团队（修改字段、软删、设负责人都走这里）
   * @param team TeamEntity，先查出来再改过的团队实体
   * @returns Promise<TeamEntity>，保存后的团队
   */
  async save(team: TeamEntity): Promise<TeamEntity> {
    // 主键已存在：SQL UPDATE kh_team SET <改动的列>, updated_at = NOW() WHERE id = :id
    return this.teamRepo.save(team);
  }

  /**
   * @description 按 ID 查一个未删除的团队（不管启用还是禁用）
   * @param id string，团队 ID
   * @returns Promise<TeamEntity | null>，找到返回团队，不存在或已删除返回 null
   */
  async findById(id: string): Promise<TeamEntity | null> {
    // SQL：SELECT * FROM kh_team WHERE id = :id AND deleted = false LIMIT 1
    return this.teamRepo.findOne({ where: { id, deleted: false } });
  }

  /**
   * @description 统计某个团队下未删除的直接子团队数，删除团队前用来判断是否还有子团队
   * @param parentId string，父团队 ID
   * @returns Promise<number>，子团队数量
   */
  async countChildren(parentId: string): Promise<number> {
    // SQL：SELECT COUNT(*) FROM kh_team WHERE parent_id = :parentId AND deleted = false
    return this.teamRepo.count({ where: { parentId, deleted: false } });
  }

  /**
   * @description 查全部可用团队（启用且未删除），用于构建团队树
   * @returns Promise<TeamEntity[]>，团队数组，按 sort 升序、同 sort 按创建时间升序
   */
  async findAllActive(): Promise<TeamEntity[]> {
    // SQL：SELECT * FROM kh_team
    return this.teamRepo.find({
      // WHERE deleted = false AND status = 1
      where: { deleted: false, status: 1 },
      // ORDER BY sort ASC, created_at ASC
      order: { sort: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * @description 分页查询未删除的团队，可按关键字模糊匹配名称或编码、按状态筛选
   * @param query TeamPageQuery，keyword 为可选关键字，status 为可选状态（0 禁用 1 启用），page 为页码，pageSize 为每页条数
   * @returns Promise<{ items: TeamEntity[]; total: number }>，items 为当前页数据，total 为符合条件的总条数
   */
  async findPage(
    query: TeamPageQuery,
  ): Promise<{ items: TeamEntity[]; total: number }> {
    // SELECT t.* FROM kh_team t WHERE t.deleted = false
    const qb = this.teamRepo.createQueryBuilder('t').where('t.deleted = false');
    if (query.keyword?.trim()) {
      // AND (t.team_name ILIKE '%关键字%' OR t.team_code ILIKE '%关键字%')（不区分大小写模糊匹配）
      qb.andWhere('(t.team_name ILIKE :kw OR t.team_code ILIKE :kw)', {
        kw: `%${query.keyword.trim()}%`,
      });
    }
    // status 可能是 0，必须用 !== undefined 判断
    if (query.status !== undefined) {
      // AND t.status = :status
      qb.andWhere('t.status = :status', { status: query.status });
    }
    // ORDER BY t.sort ASC
    qb.orderBy('t.sort', 'ASC')
      // , t.created_at DESC（同 sort 时新建的在前）
      .addOrderBy('t.created_at', 'DESC')
      // OFFSET (page - 1) * pageSize
      .skip((query.page - 1) * query.pageSize)
      // LIMIT pageSize
      .take(query.pageSize);
    // 同时执行「查当前页」和「SELECT COUNT(*) 查总数」
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * @description 统计团队成员数
   * @param teamId string，团队 ID
   * @returns Promise<number>，成员数量
   */
  async countMembers(teamId: string): Promise<number> {
    // SQL：SELECT COUNT(*) FROM kh_team_member WHERE team_id = :teamId
    return this.memberRepo.count({ where: { teamId } });
  }

  /**
   * @description 查某个用户在某个团队里的成员行，用于判断是否已经是成员
   * @param teamId string，团队 ID
   * @param userId string，用户 ID
   * @returns Promise<TeamMemberEntity | null>，是成员返回成员行，不是返回 null
   */
  async findMember(
    teamId: string,
    userId: string,
  ): Promise<TeamMemberEntity | null> {
    // SQL：SELECT * FROM kh_team_member WHERE team_id = :teamId AND user_id = :userId LIMIT 1
    return this.memberRepo.findOne({ where: { teamId, userId } });
  }

  /**
   * @description 新增一条团队成员
   * @param input Partial<TeamMemberEntity>，包含 id、teamId、userId、memberRole（leader / member）
   * @returns Promise<void>，无返回值
   */
  async saveMember(input: Partial<TeamMemberEntity>): Promise<void> {
    // SQL：INSERT INTO kh_team_member (id, team_id, user_id, member_role) VALUES (...)
    await this.memberRepo.save(this.memberRepo.create(input));
  }

  /**
   * @description 删除团队的全部成员（删除团队时调用）
   * @param teamId string，团队 ID
   * @returns Promise<void>，无返回值
   */
  async deleteAllMembers(teamId: string): Promise<void> {
    // SQL：DELETE FROM kh_team_member WHERE team_id = :teamId（物理删除）
    await this.memberRepo.delete({ teamId });
  }

  /**
   * @description 从团队里移除指定的一批用户
   * @param teamId string，团队 ID
   * @param userIds string[]，要移除的用户 ID 数组
   * @returns Promise<void>，无返回值
   */
  async deleteMembers(teamId: string, userIds: string[]): Promise<void> {
    // SQL：DELETE FROM kh_team_member WHERE team_id = :teamId AND user_id IN (:...userIds)
    await this.memberRepo.delete({ teamId, userId: In(userIds) });
  }

  /**
   * @description 按一组 ID 查未删除的用户，用于加成员前校验用户都存在
   * @param userIds string[]，用户 ID 数组
   * @returns Promise<UserEntity[]>，查到的用户；数量少于 userIds 说明有不存在的用户
   */
  async findActiveUsersByIds(userIds: string[]): Promise<UserEntity[]> {
    // SQL：SELECT * FROM kh_user WHERE id IN (:...userIds) AND deleted = false
    return this.userRepo.find({ where: { id: In(userIds), deleted: false } });
  }

  /**
   * @description 查团队成员列表，带上用户名和显示名（已删除的用户不返回）
   * @param teamId string，团队 ID
   * @returns Promise<TeamMemberVO[]>，成员数组，每项含 userId、memberRole、username、realName
   */
  async listMembers(teamId: string): Promise<TeamMemberVO[]> {
    return (
      this.memberRepo
        // FROM kh_team_member m
        .createQueryBuilder('m')
        // INNER JOIN kh_user u ON u.id = m.user_id（关联出用户信息）
        .innerJoin(UserEntity, 'u', 'u.id = m.user_id')
        // WHERE m.team_id = :teamId（只看这个团队）
        .where('m.team_id = :teamId', { teamId })
        // AND u.deleted = false（排除已删除用户）
        .andWhere('u.deleted = false')
        // SELECT 四列，并用 AS 起成驼峰别名，直接对应 TeamMemberVO 的字段
        .select([
          'm.user_id AS "userId"',
          'm.member_role AS "memberRole"',
          'u.username AS username',
          'u.real_name AS "realName"',
        ])
        // 返回原始行，不转成实体
        .getRawMany<TeamMemberVO>()
    );
  }
}

export { TeamRepository };
