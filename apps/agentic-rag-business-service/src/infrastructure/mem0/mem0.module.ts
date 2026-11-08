import { Module } from '@nestjs/common';
import { Mem0MemoryService } from './mem0-memory.service';

/** 可选 Mem0 Platform 长期记忆基础设施 */
@Module({
  providers: [Mem0MemoryService],
  exports: [Mem0MemoryService],
})
class Mem0Module {}

export { Mem0Module };
