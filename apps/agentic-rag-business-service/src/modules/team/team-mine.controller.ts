import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../user/type/user.types';
import { TeamService } from './team.service';

/** 当前用户团队查询；独立控制器确保静态 `/teams/mine` 不被动态 `/:id` 抢先匹配。 */
@Controller('teams/mine')
class TeamMineController {
  /**
   * @description 注入团队业务服务。
   * @param teamService TeamService，查询当前用户所在或负责的团队。
   */
  constructor(private readonly teamService: TeamService) {}

  /**
   * @description GET /teams/mine：查询当前用户作为成员或负责人的团队，登录即可。
   * @param user AuthUser，当前登录用户。
   * @returns Promise<TeamEntity[]>，当前用户可访问的团队。
   */
  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.teamService.listMine(user.userId);
  }
}

export { TeamMineController };
