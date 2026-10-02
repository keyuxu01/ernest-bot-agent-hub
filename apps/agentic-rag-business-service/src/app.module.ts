import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ORPCModule } from '@orpc/nest';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ApiDocsModule } from './modules/api-docs/api-docs.module';
import { DocumentModule } from './modules/document/document.module';
import { GreetingModule } from './modules/greeting/greeting.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 后列覆盖前列；与仓库根 compose 用的 .env.dev 分离
      envFilePath: ['.env.local', '.env.dev', '.env'],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    ORPCModule.forRoot({}),
    ApiDocsModule,
    GreetingModule,
    HealthModule,
    DocumentModule,
  ],
})
export class AppModule {}
