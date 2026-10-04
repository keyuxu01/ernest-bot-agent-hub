import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ORPCModule } from '@orpc/nest';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RustfsModule } from './infrastructure/rustfs/rustfs.module';
import { ApiDocsModule } from './modules/api-docs/api-docs.module';
import { DocumentModule } from './modules/document/document.module';
import { GreetingModule } from './modules/greeting/greeting.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // 配置
    ConfigModule.forRoot({
      isGlobal: true,
      // 后列覆盖前列；与仓库根 compose 用的 .env.dev 分离
      envFilePath: ['.env.local', '.env.dev', '.env'],
      validate: validateEnvironment,
    }),

    // 基础设施
    DatabaseModule,
    RustfsModule,

    // 协议 / 平台
    ORPCModule.forRoot({}),
    ApiDocsModule,

    // 业务 feature
    GreetingModule,
    HealthModule,
    DocumentModule,
  ],
})
export class AppModule {}
