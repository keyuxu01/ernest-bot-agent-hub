import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { TeamMemberEntity } from './entities/team-member.entity';
import { TeamEntity } from './entities/team.entity';
import { TeamRepository } from './repository/team.repository';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

/** 团队模块：kh_team / kh_team_member；成员关联 kh_user */
@Module({
  imports: [
    TypeOrmModule.forFeature([TeamEntity, TeamMemberEntity, UserEntity]),
  ],
  controllers: [TeamController],
  providers: [TeamRepository, TeamService],
  exports: [TeamService],
})
class TeamModule {}

export { TeamModule };
