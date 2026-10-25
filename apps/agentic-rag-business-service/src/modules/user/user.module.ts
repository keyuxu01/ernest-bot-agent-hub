import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { UserEntity } from './entities/user.entity';
import { UserRepository } from './repository/user.repository';
import { UserService } from './user.service';

/**
 * 用户模块：账号、角色与用户-角色关联（kh_user / kh_role / kh_user_role）
 * 只对外提供 UserService；HTTP 入口与 token 在 AuthModule。
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity, UserRoleEntity])],
  providers: [UserRepository, UserService],
  exports: [UserService],
})
class UserModule {}

export { UserModule };
