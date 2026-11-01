import type { TeamEntity } from '../entities/team.entity';

/** 团队分页查询条件（Repository 入参） */
interface TeamPageQuery {
  keyword?: string;
  status?: number;
  page: number;
  pageSize: number;
}

/** 团队树节点 */
type TeamTreeNode = TeamEntity & { children: TeamTreeNode[] };

/** 团队成员列表项（关联 kh_user） */
interface TeamMemberVO {
  userId: string;
  memberRole: string;
  username: string;
  realName: string | null;
}

export type { TeamMemberVO, TeamPageQuery, TeamTreeNode };
