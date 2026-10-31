import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import { DocumentRepository } from '../document/repository/document.repository';
import { RoleCode } from './constants/user.constants';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateProfileDto } from './dto/profile.dto';
import type { QueryUserDto } from './dto/query-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { UserRepository } from './repository/user.repository';
import type { AuthUser, UserVO } from './type/user.types';

/** 用户服务：凭据校验、注册、用户 / 角色管理、个人资料与统计；数据访问经 Repository */
@Injectable()
class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly documentRepo: DocumentRepository,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepo.findByEmail(email);
  }

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

  /** 邮箱须在未删除用户中唯一；exceptUserId 为本人时允许保持原邮箱 */
  private async assertEmailAvailable(
    email: string,
    exceptUserId?: string,
  ): Promise<void> {
    const owner = await this.findByEmail(email);
    if (owner && owner.id !== exceptUserId) {
      throw new ConflictException('邮箱已被使用');
    }
  }

  async getRoleCodes(userId: string): Promise<string[]> {
    return this.userRepo.getRoleCodes(userId);
  }

  async toUserVO(user: UserEntity): Promise<UserVO> {
    const roleCodes = await this.getRoleCodes(user.id);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      realName: user.realName,
      avatar: user.avatar,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roleCodes,
    };
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
    // 待激活账户注册时 status 也为 0，须先判未激活，否则会误报"已禁用"
    if (user.emailVerified === 0) {
      throw new UnauthorizedException('账户未激活，请先验证邮箱');
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
    requireEmailVerification?: boolean;
  }): Promise<{
    userId: string;
    emailVerificationRequired?: boolean;
  }> {
    const exists = await this.findByUsername(input.username);
    if (exists) {
      throw new ConflictException('用户名已存在');
    }
    if (input.email) {
      await this.assertEmailAvailable(input.email);
    }

    const userId = nextSnowflakeId();
    const needVerify = input.requireEmailVerification && !!input.email;
    await this.userRepo.saveUser({
      id: userId,
      username: input.username,
      password: await hash(input.password, 10),
      email: input.email ?? null,
      realName: input.realName ?? null,
      status: needVerify ? 0 : 1,
      emailVerified: needVerify ? 0 : 1,
    });
    await this.assignRole(userId, RoleCode.USER);
    return {
      userId,
      emailVerificationRequired: needVerify,
    };
  }

  /** 管理员创建用户 */
  async createUser(dto: CreateUserDto): Promise<string> {
    const exists = await this.findByUsername(dto.username);
    if (exists) {
      throw new ConflictException('用户名已存在');
    }
    if (dto.email) {
      await this.assertEmailAvailable(dto.email);
    }
    const userId = nextSnowflakeId();
    await this.userRepo.saveUser({
      id: userId,
      username: dto.username,
      password: await hash(dto.password, 10),
      email: dto.email ?? null,
      realName: dto.realName ?? null,
      avatar: dto.avatar ?? null,
      status: dto.status ?? 1,
      emailVerified: 1,
    });
    const roleCodes = dto.roleCodes?.length ? dto.roleCodes : [RoleCode.USER];
    await this.replaceRoles(userId, roleCodes);
    return userId;
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<UserVO> {
    const user = await this.findByIdOrThrow(userId);
    if (dto.email) await this.assertEmailAvailable(dto.email, userId);
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.realName !== undefined) user.realName = dto.realName;
    if (dto.avatar !== undefined) user.avatar = dto.avatar;
    if (dto.status !== undefined) user.status = dto.status;
    await this.userRepo.save(user);
    return this.toUserVO(user);
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.findByIdOrThrow(userId);
    user.deleted = true;
    await this.userRepo.save(user);
  }

  async pageUsers(query: QueryUserDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { users, total } = await this.userRepo.findPage({
      keyword: query.keyword,
      roleCode: query.roleCode,
      status: query.status,
      page,
      pageSize,
    });
    const items = await Promise.all(users.map((u) => this.toUserVO(u)));
    return { items, total, page, pageSize };
  }

  async getUserVO(userId: string): Promise<UserVO> {
    const user = await this.findByIdOrThrow(userId);
    return this.toUserVO(user);
  }

  async getUserRoleCodes(userId: string): Promise<string[]> {
    await this.findByIdOrThrow(userId);
    return this.getRoleCodes(userId);
  }

  /** 全量替换用户角色 */
  async replaceRoles(userId: string, roleCodes: string[]): Promise<string[]> {
    await this.findByIdOrThrow(userId);
    const roles = await this.userRepo.findActiveRolesByCodes(roleCodes);
    if (roles.length !== roleCodes.length) {
      const found = new Set(roles.map((r) => r.roleCode));
      const missing = roleCodes.filter((c) => !found.has(c));
      throw new NotFoundException(`角色不存在: ${missing.join(', ')}`);
    }

    await this.userRepo.deleteUserRoles(userId);
    for (const role of roles) {
      await this.userRepo.saveUserRole({
        id: nextSnowflakeId(),
        userId,
        roleId: role.id,
      });
    }
    return roleCodes;
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

  async listAllRoles(): Promise<RoleEntity[]> {
    return this.userRepo.findAllActiveRoles();
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserVO> {
    const user = await this.findByIdOrThrow(userId);
    if (dto.email) await this.assertEmailAvailable(dto.email, userId);
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.realName !== undefined) user.realName = dto.realName;
    if (dto.avatar !== undefined) user.avatar = dto.avatar;
    await this.userRepo.save(user);
    return this.toUserVO(user);
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findByIdOrThrow(userId);
    const ok = await compare(oldPassword, user.password);
    if (!ok) throw new BadRequestException('原密码错误');
    user.password = await hash(newPassword, 10);
    await this.userRepo.save(user);
  }

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.findByIdOrThrow(userId);
    user.password = await hash(newPassword, 10);
    await this.userRepo.save(user);
  }

  async resetPasswordByEmail(
    email: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('该邮箱未注册');
    user.password = await hash(newPassword, 10);
    await this.userRepo.save(user);
  }

  async activateEmail(userId: string): Promise<string> {
    const user = await this.findByIdOrThrow(userId);
    if (user.emailVerified === 1) return '账户已激活，请直接登录';
    user.emailVerified = 1;
    user.status = 1;
    await this.userRepo.save(user);
    return '账户激活成功，请登录';
  }

  async getUserStatistics(userId: string) {
    await this.findByIdOrThrow(userId);
    const documentCount = await this.documentRepo.countActiveByAuthor(userId);
    const raw = await this.documentRepo.sumStatsByAuthor(userId);
    return {
      documentCount,
      viewCount: Number(raw?.viewCount ?? 0),
      likeCount: Number(raw?.likeCount ?? 0),
      commentCount: Number(raw?.commentCount ?? 0),
    };
  }

  /**
   * 启动时按 AUTH_BOOTSTRAP_ADMIN_* 确保初始管理员存在（ROLE_ADMIN + ROLE_REVIEWER）
   * 已存在则不做任何修改（不重置密码、不补角色、不改邮箱）
   * 不走邮件激活，创建即为已验证
   * @returns true 表示本次新建
   */
  async ensureBootstrapAdmin(
    username: string,
    password: string,
    email: string,
  ): Promise<boolean> {
    if (await this.findByUsername(username)) {
      return false;
    }
    const { userId } = await this.register({
      username,
      password,
      email,
      realName: '系统管理员',
    });
    await this.assignRole(userId, RoleCode.ADMIN);
    await this.assignRole(userId, RoleCode.REVIEWER);
    return true;
  }
}

export { UserService };
