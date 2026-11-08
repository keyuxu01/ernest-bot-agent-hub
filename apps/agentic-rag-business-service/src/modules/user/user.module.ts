import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentModule } from '../document/document.module';
import { TeamModule } from '../team/team.module';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserPermissionEntity } from './entities/user-permission.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { UserEntity } from './entities/user.entity';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';
import { PermissionRepository } from './repository/permission.repository';
import { RoleRepository } from './repository/role.repository';
import { UserRepository } from './repository/user.repository';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * 用户模块：账号、角色、权限及其关联
 * （kh_user / kh_role / kh_user_role / kh_permission / kh_role_permission / kh_user_permission）与管理接口
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      RoleEntity,
      UserRoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      UserPermissionEntity,
    ]),
    // 个人统计按作者聚合文档，经 DocumentRepository 访问
    DocumentModule,
    TeamModule,
  ],
  controllers: [UserController, RoleController, PermissionController],
  providers: [
    UserRepository,
    RoleRepository,
    PermissionRepository,
    UserService,
    RoleService,
    PermissionService,
  ],
  exports: [UserService, RoleService, PermissionService],
})
class UserModule {}

export { UserModule };
