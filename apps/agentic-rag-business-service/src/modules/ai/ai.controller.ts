import { Body, Controller, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionCode } from '../user/constants/permission.constants';
import { AiChatService } from './ai-chat.service';
import { ChatDto } from './dto/chat.dto';
import { RagSearchDto } from './dto/rag-search.dto';
import { HybridRetrievalService } from './hybrid-retrieval.service';

/** RAG 检索与问答接口（需登录 + search 权限码） */
@Controller()
class AiController {
  /**
   * @description 注入问答与混合检索服务
   * @param aiChat AiChatService，检索后调 LLM 作答
   * @param retrieval HybridRetrievalService，kh_chunk 混合检索
   */
  constructor(
    private readonly aiChat: AiChatService,
    private readonly retrieval: HybridRetrievalService,
  ) {}

  /**
   * @description POST /rag/search：RAG 混合检索（关键词 BM25 + 向量 kNN → RRF → rerank），不调 LLM，只返回 kh_chunk 命中
   * @param dto RagSearchDto，请求体：query 必填，topK 默认 5、最大 20
   * @returns Promise<ChunkHit[]>，最相关的块（含 chunkId、documentId、documentTitle、content、heading、score）
   */
  @Post('rag/search')
  @RequirePermission(PermissionCode.search)
  search(@Body() dto: RagSearchDto) {
    return this.retrieval.retrieve(dto.query.trim(), dto.topK ?? 5);
  }

  /**
   * @description POST /ai/chat：RAG 对话，混合检索后再让 LLM 作答
   * @param dto ChatDto，请求体：content（问题）必填，topK 默认 5、最大 10
   * @returns Promise<ChatResult>，answer 与引用到的 sources
   */
  @Post('ai/chat')
  @RequirePermission(PermissionCode.search)
  chat(@Body() dto: ChatDto) {
    return this.aiChat.chat(dto.content, dto.topK ?? 5);
  }
}

export { AiController };
