import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/** 应用入口：创建 Nest 实例、注册全局校验、监听 HTTP 端口 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局 DTO 校验（class-validator），作用于 @Body() / @Query() 等
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 去掉 DTO 未声明的字段，防止多余入参写入
      transform: true, // 将 plain object 转为 DTO 实例，并做类型转换（如 query 字符串 → number）
      forbidNonWhitelisted: true, // 出现未声明字段时直接 400，而不是静默丢弃
    }),
  );

  // 9020：9xxx 段；9000/9001 留给 Compose RustFS（不改 compose 映射）
  await app.listen(process.env.PORT ?? 9020);
}
void bootstrap();
