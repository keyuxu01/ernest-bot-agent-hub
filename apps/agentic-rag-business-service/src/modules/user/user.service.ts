import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import { RoleCode } from './constants/user.constants';
import { UserEntity } from './entities/user.entity';
import { UserRepository } from './repository/user.repository';
import type { AuthUser } from './type/user.types';

/** 用户服务：凭据校验、注册、当前用户与角色；数据访问经 UserRepository */
@Injectable()
class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findByUsername(username);
  }

  async findByIdOrThrow(userId: string): Promise<UserEntity> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  async getRoleCodes(userId: string): Promise<string[]> {
    return this.userRepo.getRoleCodes(userId);
  }

  toAuthUser(user: UserEntity, roles: string[]): AuthUser {
    return {
      userId: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      avatar: user.avatar,
      roles,
    };
  }

  async buildAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.findByIdOrThrow(userId);
    if (user.status !== 1) {
      throw new UnauthorizedException('账户已禁用');
    }
    const roles = await this.getRoleCodes(userId);
    return this.toAuthUser(user, roles);
  }

  async validateCredentials(
    username: string,
    password: string,
  ): Promise<AuthUser> {
    const user = await this.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.status !== 1) {
      throw new UnauthorizedException('账户已禁用');
    }
    const ok = await compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const roles = await this.getRoleCodes(user.id);
    return this.toAuthUser(user, roles);
  }

  async register(input: {
    username: string;
    password: string;
    email?: string;
    realName?: string;
  }): Promise<{ userId: string }> {
    const exists = await this.findByUsername(input.username);
    if (exists) {
      throw new ConflictException('用户名已存在');
    }

    const userId = nextSnowflakeId();
    await this.userRepo.saveUser({
      id: userId,
      username: input.username,
      password: await hash(input.password, 10),
      email: input.email ?? null,
      realName: input.realName ?? null,
      status: 1,
    });
    await this.assignRole(userId, RoleCode.USER);
    return { userId };
  }

  async assignRole(userId: string, roleCode: string): Promise<void> {
    const role = await this.userRepo.findRoleByCode(roleCode);
    if (!role) {
      throw new NotFoundException(`角色 ${roleCode} 不存在`);
    }
    const exists = await this.userRepo.findUserRole(userId, role.id);
    if (exists) return;

    await this.userRepo.saveUserRole({
      id: nextSnowflakeId(),
      userId,
      roleId: role.id,
    });
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.userRepo.touchLastLogin(userId);
  }

  async getUserIdsByRoleCode(roleCode: string): Promise<string[]> {
    return this.userRepo.getUserIdsByRoleCode(roleCode);
  }

  /**
   * 启动时按 AUTH_BOOTSTRAP_ADMIN_* 确保初始管理员存在（ROLE_ADMIN + ROLE_REVIEWER）
   * 已存在则不做任何修改（不重置密码、不补角色）
   * @returns true 表示本次新建
   */
  async ensureBootstrapAdmin(
    username: string,
    password: string,
  ): Promise<boolean> {
    if (await this.findByUsername(username)) {
      return false;
    }
    const { userId } = await this.register({
      username,
      password,
      realName: '系统管理员',
    });
    await this.assignRole(userId, RoleCode.ADMIN);
    await this.assignRole(userId, RoleCode.REVIEWER);
    return true;
  }
}

export { UserService };
