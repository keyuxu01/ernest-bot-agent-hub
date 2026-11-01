import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { PermissionService } from './permission.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/extra.dto';
import { AssignPermissionIdsDto } from './dto/permission.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RoleCode } from './constants/user.constants';

@Controller('roles')
@Roles(RoleCode.ADMIN)
export class RoleController {
  /**
   * @description 注入角色、权限业务服务
   * @param roleService RoleService，角色增删改查
   * @param permissionService PermissionService，角色绑权限
   */
  constructor(
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
  ) {}

  @Get('list')
  async listRoles() {
    const roles = await this.roleService.listAll();
    return roles.map((r) => ({
      id: r.id,
      roleName: r.roleName,
      roleCode: r.roleCode,
      description: r.description,
    }));
  }

  @Get(':id')
  async getRole(@Param('id') id: string) {
    const role = await this.roleService.getById(id);
    return {
      id: role.id,
      roleName: role.roleName,
      roleCode: role.roleCode,
      description: role.description,
      status: role.status,
    };
  }

  @Post()
  async createRole(@Body() dto: CreateRoleDto) {
    const role = await this.roleService.create(dto);
    return {
      id: role.id,
      roleName: role.roleName,
      roleCode: role.roleCode,
      description: role.description,
    };
  }

  @Put(':id')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.roleService.update(id, dto);
    return {
      id: role.id,
      roleName: role.roleName,
      roleCode: role.roleCode,
      description: role.description,
      status: role.status,
    };
  }

  @Delete(':id')
  async deleteRole(@Param('id') id: string) {
    await this.roleService.delete(id);
    return { message: '删除成功' };
  }

  /**
   * @description GET /roles/:id/permissions：查角色绑定的权限（管理员 + system:role）
   * @param id string，路径参数，角色 ID；角色不存在返回 404
   * @returns Promise<{ roleId: string; permissionIds: string[] }>，角色 ID 和绑定的权限 ID
   */
  @Get(':id/permissions')
  @RequirePermission('system:role')
  async getRolePermissions(@Param('id') id: string) {
    const permissionIds = await this.permissionService.getRolePermissionIds(id);
    return { roleId: id, permissionIds };
  }

  /**
   * @description PUT /roles/:id/permissions：全量替换角色权限（管理员 + system:role）
   * @param id string，路径参数，角色 ID；角色不存在返回 404
   * @param dto AssignPermissionIdsDto，请求体，permissionIds 为新的完整权限 ID 列表，空数组表示清空
   * @returns Promise<{ roleId: string; permissionIds: string[] }>，角色 ID 和替换后的权限 ID
   */
  @Put(':id/permissions')
  @RequirePermission('system:role')
  async assignRolePermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionIdsDto,
  ) {
    const permissionIds = await this.permissionService.assignRolePermissions(
      id,
      dto,
    );
    return { roleId: id, permissionIds };
  }
}
