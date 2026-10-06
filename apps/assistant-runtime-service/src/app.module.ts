import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { AssistantModule } from './modules/assistant/assistant.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env.dev', '.env'],
      validate: validateEnvironment,
    }),
    HealthModule,
    AssistantModule,
  ],
})
export class AppModule {}
