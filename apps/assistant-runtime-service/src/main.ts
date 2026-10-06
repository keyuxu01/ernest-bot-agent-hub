import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** 助手 Runtime 入口：默认端口 9030，避开 RAG 9020 与 MCP 9021 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 9030);
}

void bootstrap();
