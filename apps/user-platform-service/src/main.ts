import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from './config/environment';

/** UserPlatform 仅组合身份与访问模块；业务逻辑必须留在 feature module。 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? DEFAULT_PORT);
}

void bootstrap();
