import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import type { CreateRoleDto, UpdateRoleDto } from './dto/extra.dto';
import { RoleRepository } from './repository/role.repository';

/** 角色管理 */
@Injectable()
class RoleService {
  constructor(private readonly roleRepo: RoleRepository) {}

  async listAll() {
    return this.roleRepo.findAllActive();
  }

  async getById(id: string) {
    const role = await this.roleRepo.findById(id);
    if (!role) throw new NotFoundException('角色不存在');
    return role;
  }

  async create(dto: CreateRoleDto) {
    const exists = await this.roleRepo.findByCode(dto.roleCode);
    if (exists) throw new ConflictException('角色编码已存在');
    return this.roleRepo.create({
      id: nextSnowflakeId(),
      roleName: dto.roleName,
      roleCode: dto.roleCode,
      description: dto.description ?? null,
      status: 1,
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.getById(id);
    if (dto.roleName !== undefined) role.roleName = dto.roleName;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.status !== undefined) role.status = dto.status;
    return this.roleRepo.save(role);
  }

  async delete(id: string) {
    const role = await this.getById(id);
    const bound = await this.roleRepo.countUserBindings(id);
    if (bound > 0) {
      throw new BadRequestException('角色仍有关联用户，无法删除');
    }
    await this.roleRepo.remove(role);
  }
}

export { RoleService };
