import { Module } from '@nestjs/common';
import { ChatModelService } from './chat-model.service';

/** 通义千问对话模型客户端（当前用于 KG 实体关系抽取） */
@Module({
  providers: [ChatModelService],
  exports: [ChatModelService],
})
class ChatModelModule {}

export { ChatModelModule };
