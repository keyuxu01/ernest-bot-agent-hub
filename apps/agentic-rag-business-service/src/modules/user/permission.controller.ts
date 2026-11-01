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
import { RoleCode } from './constants/user.constants';
import {
  CreatePermissionDto,
  QueryPermissionDto,
  UpdatePermissionDto,
} from './dto/permission.dto';
import { PermissionService } from './permission.service';

/** 权限管理（管理员）；读接口要 system:permission，写接口要对应的 create / edit / delete 码 */
@Controller('permissions')
@Roles(RoleCode.ADMIN)
class PermissionController {
  /**
   * @description 注入权限业务服务
   * @param permissionService PermissionService，权限管理业务逻辑
   */
  constructor(private readonly permissionService: PermissionService) {}

  /**
   * @description GET /permissions/list：全部可用权限（平铺）
   * @returns Promise<PermissionEntity[]>，启用且未删除的权限
   */
  @Get('list')
  @RequirePermission('system:permission')
  async list() {
    return this.permissionService.listAll();
  }

  /**
   * @description GET /permissions/tree：权限树
   * @returns Promise<PermissionTreeNode[]>，根节点数组，子节点在 children 里
   */
  @Get('tree')
  @RequirePermission('system:permission')
  async tree() {
    return this.permissionService.getTree();
  }

  /**
   * @description GET /permissions/page：分页查询权限
   * @param query QueryPermissionDto，查询参数 keyword、page、pageSize
   * @returns Promise<{ items: PermissionEntity[]; total: number; page: number; pageSize: number }>，分页结果
   */
  @Get('page')
  @RequirePermission('system:permission')
  async page(@Query() query: QueryPermissionDto) {
    return this.permissionService.page(query);
  }

  /**
   * @description GET /permissions/:id/children：某个权限的直接子权限
   * @param id string，路径参数，父权限 ID
   * @returns Promise<PermissionEntity[]>，子权限数组
   */
  @Get(':id/children')
  @RequirePermission('system:permission')
  async children(@Param('id') id: string) {
    return this.permissionService.getChildren(id);
  }

  /**
   * @description GET /permissions/:id：权限详情
   * @param id string，路径参数，权限 ID
   * @returns Promise<PermissionEntity>，权限实体；不存在返回 404
   */
  @Get(':id')
  @RequirePermission('system:permission')
  async getById(@Param('id') id: string) {
    return this.permissionService.getById(id);
  }

  /**
   * @description POST /permissions：新建权限
   * @param dto CreatePermissionDto，请求体；permissionName、permissionCode、permissionType 必填
   * @returns Promise<PermissionEntity>，新建的权限；编码重复返回 409
   */
  @Post()
  @RequirePermission('system:permission:create')
  async create(@Body() dto: CreatePermissionDto) {
    return this.permissionService.create(dto);
  }

  /**
   * @description PUT /permissions/:id：修改权限
   * @param id string，路径参数，权限 ID
   * @param dto UpdatePermissionDto，请求体，要修改的字段
   * @returns Promise<PermissionEntity>，修改后的权限
   */
  @Put(':id')
  @RequirePermission('system:permission:edit')
  async update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionService.update(id, dto);
  }

  /**
   * @description DELETE /permissions/:id：软删权限（有子权限或仍有绑定时返回 400）
   * @param id string，路径参数，权限 ID
   * @returns Promise<{ message: string }>，固定返回 { message: '删除成功' }
   */
  @Delete(':id')
  @RequirePermission('system:permission:delete')
  async delete(@Param('id') id: string) {
    await this.permissionService.delete(id);
    return { message: '删除成功' };
  }
}

export { PermissionController };
