import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentModule } from '../document/document.module';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { UserEntity } from './entities/user.entity';
import { RoleRepository } from './repository/role.repository';
import { UserRepository } from './repository/user.repository';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/** 用户模块：账号、角色与用户-角色关联（kh_user / kh_role / kh_user_role）及管理接口 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RoleEntity, UserRoleEntity]),
    // 个人统计按作者聚合文档，经 DocumentRepository 访问
    DocumentModule,
  ],
  controllers: [UserController, RoleController],
  providers: [UserRepository, RoleRepository, UserService, RoleService],
  exports: [UserService, RoleService],
})
class UserModule {}

export { UserModule };
