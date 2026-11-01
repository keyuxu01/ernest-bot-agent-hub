import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode } from '../user/constants/user.constants';
import { CreateTeamDto, QueryTeamDto, UpdateTeamDto } from './dto/team.dto';
import { TeamService } from './team.service';

/** 团队管理（管理员；除团队树外还要求 system:team） */
@Controller('teams')
@Roles(RoleCode.ADMIN)
class TeamController {
  /**
   * @description 注入团队业务服务
   * @param teamService TeamService，团队与成员的业务逻辑
   */
  constructor(private readonly teamService: TeamService) {}

  /**
   * @description POST /teams：新建团队
   * @param dto CreateTeamDto，请求体；teamName 必填，其余可选
   * @returns Promise<TeamEntity>，新建的团队
   */
  @Post()
  @RequirePermission('system:team')
  create(@Body() dto: CreateTeamDto) {
    return this.teamService.create(dto);
  }

  /**
   * @description PUT /teams/:id：修改团队
   * @param id string，路径参数，团队 ID
   * @param dto UpdateTeamDto，请求体，要修改的字段
   * @returns Promise<TeamEntity>，修改后的团队
   */
  @Put(':id')
  @RequirePermission('system:team')
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teamService.update(id, dto);
  }

  /**
   * @description DELETE /teams/:id：软删团队并删除其成员
   * @param id string，路径参数，团队 ID
   * @returns Promise<{ message: string }>，固定返回 { message: '删除成功' }
   */
  @Delete(':id')
  @RequirePermission('system:team')
  async delete(@Param('id') id: string) {
    await this.teamService.delete(id);
    return { message: '删除成功' };
  }

  /**
   * @description GET /teams/page：分页查询团队
   * @param query QueryTeamDto，查询参数 keyword、status、page、pageSize
   * @returns Promise<{ items: TeamEntity[]; total: number; page: number; pageSize: number }>，分页结果
   */
  @Get('page')
  @RequirePermission('system:team')
  page(@Query() query: QueryTeamDto) {
    return this.teamService.page(query);
  }

  /**
   * @description GET /teams/tree：团队树（只受类上的 @Roles(ADMIN) 约束，不要求 system:team）
   * @param rootOnly string | undefined，查询参数；为 'true' 时只返回根团队
   * @returns Promise<TeamEntity[] | TeamTreeNode[]>，团队树或根团队列表
   */
  @Get('tree')
  getTree(@Query('rootOnly') rootOnly?: string) {
    return this.teamService.getTree(rootOnly === 'true');
  }

  /**
   * @description GET /teams/:id：团队详情（含成员数）
   * @param id string，路径参数，团队 ID
   * @returns Promise<TeamEntity & { memberCount: number }>，团队详情
   */
  @Get(':id')
  @RequirePermission('system:team')
  getDetail(@Param('id') id: string) {
    return this.teamService.getDetail(id);
  }

  /**
   * @description POST /teams/:id/members：批量加成员
   * @param id string，路径参数，团队 ID
   * @param userIds string[]，请求体为用户 ID 数组，如 ["123", "456"]
   * @returns Promise<boolean>，成功返回 true
   */
  @Post(':id/members')
  @RequirePermission('system:team')
  addMembers(@Param('id') id: string, @Body() userIds: string[]) {
    return this.teamService.addMembers(id, userIds);
  }

  /**
   * @description DELETE /teams/:id/members：批量移除成员
   * @param id string，路径参数，团队 ID
   * @param userIds string[]，请求体为用户 ID 数组
   * @returns Promise<boolean>，成功返回 true
   */
  @Delete(':id/members')
  @RequirePermission('system:team')
  removeMembers(@Param('id') id: string, @Body() userIds: string[]) {
    return this.teamService.removeMembers(id, userIds);
  }

  /**
   * @description GET /teams/:id/members：成员列表
   * @param id string，路径参数，团队 ID
   * @returns Promise<TeamMemberVO[]>，成员数组，含 userId、memberRole、username、realName
   */
  @Get(':id/members')
  @RequirePermission('system:team')
  listMembers(@Param('id') id: string) {
    return this.teamService.listMembers(id);
  }
}

export { TeamController };
