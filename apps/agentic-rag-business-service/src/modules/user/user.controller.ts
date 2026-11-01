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
import { UserService } from './user.service';
import { QueryUserDto } from './dto/query-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { AssignPermissionIdsDto } from './dto/permission.dto';
import { UpdateProfileDto } from './dto/profile.dto';
import { ChangePasswordDto, ResetPasswordDto } from './dto/password.dto';
import { PermissionService } from './permission.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RoleCode } from './constants/user.constants';
import type { AuthUser } from './type/user.types';

@Controller('users')
export class UserController {
  /**
   * @description 注入用户、权限业务服务
   * @param userService UserService，用户管理与个人资料
   * @param permissionService PermissionService，用户直接权限的查询与替换
   */
  constructor(
    private readonly userService: UserService,
    private readonly permissionService: PermissionService,
  ) {}

  @Put('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(user.userId, dto);
  }

  @Get('me/stats')
  getMyStats(@CurrentUser() user: AuthUser) {
    return this.userService.getUserStatistics(user.userId);
  }

  @Put('password/change')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.userService.changePassword(
      user.userId,
      dto.oldPassword,
      dto.newPassword,
    );
    return { message: '密码修改成功' };
  }

  @Get('page')
  @Roles(RoleCode.ADMIN)
  pageUsers(@Query() query: QueryUserDto) {
    return this.userService.pageUsers(query);
  }

  @Get(':id')
  @Roles(RoleCode.ADMIN)
  getUser(@Param('id') id: string) {
    return this.userService.getUserVO(id);
  }

  @Post()
  @Roles(RoleCode.ADMIN)
  async createUser(@Body() dto: CreateUserDto) {
    const userId = await this.userService.createUser(dto);
    return this.userService.getUserVO(userId);
  }

  @Put(':id')
  @Roles(RoleCode.ADMIN)
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(id, dto);
  }

  @Delete(':id')
  @Roles(RoleCode.ADMIN)
  async deleteUser(@Param('id') id: string) {
    await this.userService.deleteUser(id);
    return { message: '删除成功' };
  }

  @Put(':id/password/reset')
  @Roles(RoleCode.ADMIN)
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    await this.userService.resetPassword(id, dto.newPassword);
    return { message: '密码重置成功' };
  }

  @Get(':id/roles')
  @Roles(RoleCode.ADMIN)
  async getUserRoles(@Param('id') id: string) {
    const roleCodes = await this.userService.getUserRoleCodes(id);
    return { userId: id, roleCodes };
  }

  /**
   * @description PUT /users/:id/roles：全量替换用户角色（管理员 + system:user）
   * @param id string，路径参数，用户 ID
   * @param dto AssignRolesDto，请求体，roleCodes 为新的完整角色编码列表（不能为空）
   * @returns Promise<{ userId: string; roleCodes: string[] }>，用户 ID 和替换后的角色编码
   */
  @Put(':id/roles')
  @Roles(RoleCode.ADMIN)
  @RequirePermission('system:user')
  async assignRoles(@Param('id') id: string, @Body() dto: AssignRolesDto) {
    const roleCodes = await this.userService.replaceRoles(id, dto.roleCodes);
    return { userId: id, roleCodes };
  }

  /**
   * @description GET /users/:id/permissions：查用户权限（管理员 + system:user）
   * @param id string，路径参数，用户 ID；用户不存在返回 404
   * @returns Promise<{ userId: string; permissionCodes: string[]; directPermissionIds: string[] }>，
   * permissionCodes 为合并后的生效权限编码（直接 + 角色 + 管理员追加），directPermissionIds 为直接绑定的权限 ID
   */
  @Get(':id/permissions')
  @Roles(RoleCode.ADMIN)
  @RequirePermission('system:user')
  async getUserPermissions(@Param('id') id: string) {
    await this.userService.findByIdOrThrow(id);
    const permissionCodes =
      await this.permissionService.getUserPermissionCodes(id);
    const permissionIds =
      await this.permissionService.getUserDirectPermissionIds(id);
    return { userId: id, permissionCodes, directPermissionIds: permissionIds };
  }

  /**
   * @description PUT /users/:id/permissions：全量替换用户的直接权限（管理员 + system:user）
   * @param id string，路径参数，用户 ID；用户不存在返回 404
   * @param dto AssignPermissionIdsDto，请求体，permissionIds 为新的完整权限 ID 列表，空数组表示清空
   * @returns Promise<{ userId: string; permissionIds: string[] }>，用户 ID 和替换后的直接权限 ID
   */
  @Put(':id/permissions')
  @Roles(RoleCode.ADMIN)
  @RequirePermission('system:user')
  async assignUserPermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionIdsDto,
  ) {
    await this.userService.findByIdOrThrow(id);
    const permissionIds = await this.permissionService.assignUserPermissions(
      id,
      dto,
    );
    return { userId: id, permissionIds };
  }
}
