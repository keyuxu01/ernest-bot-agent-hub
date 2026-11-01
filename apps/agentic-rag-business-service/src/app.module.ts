import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ORPCModule } from '@orpc/nest';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ElasticsearchModule } from './infrastructure/elasticsearch/elasticsearch.module';
import { EmbeddingModule } from './infrastructure/embedding/embedding.module';
import { MailModule } from './infrastructure/mail/mail.module';
import { RabbitmqModule } from './infrastructure/rabbitmq/rabbitmq.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RustfsModule } from './infrastructure/rustfs/rustfs.module';
import { ApiDocsModule } from './modules/api-docs/api-docs.module';
import { AuthModule } from './modules/auth/auth.module';
import { DocumentModule } from './modules/document/document.module';
import { GreetingModule } from './modules/greeting/greeting.module';
import { HealthModule } from './modules/health/health.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { TeamModule } from './modules/team/team.module';

@Module({
  imports: [
    // 配置
    ConfigModule.forRoot({
      isGlobal: true,
      // 后列覆盖前列；缺文件会跳过。生产放 .env.prod 覆盖 .env.dev
      envFilePath: ['.env.dev', '.env.prod'],
      validate: validateEnvironment,
    }),

    // 基础设施
    DatabaseModule,
    RustfsModule,
    RabbitmqModule,
    ElasticsearchModule,
    EmbeddingModule,
    RedisModule,
    MailModule,

    // 协议 / 平台
    ORPCModule.forRoot({}),
    ApiDocsModule,
    // 认证：注册全局 JWT / 角色 / 权限码守卫，接口默认需登录
    AuthModule,

    // 业务 feature
    GreetingModule,
    HealthModule,
    DocumentModule,
    PipelineModule,
    TeamModule,
  ],
})
export class AppModule {}
