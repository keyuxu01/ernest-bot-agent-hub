import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionCode } from '../user/constants/permission.constants';
import type { AuthUser } from '../user/type/user.types';
import { AiChatService } from './ai-chat.service';
import { AiStreamService } from './ai-stream.service';
import { ChatSessionService } from './chat-session.service';
import { ChatDto } from './dto/chat.dto';
import { ChatStreamDto } from './dto/chat-stream.dto';
import { RagSearchDto } from './dto/rag-search.dto';
import {
  CreateSessionDto,
  QuerySessionDto,
  UpdateSessionDto,
} from './dto/session.dto';
import { HybridRetrievalService } from './hybrid-retrieval.service';

/** RAG 检索、问答与当前用户会话接口（需登录 + search 权限码） */
@Controller()
class AiController {
  /**
   * @description 注入问答、混合检索与会话服务
   * @param aiChat AiChatService，检索后调 LLM 作答并保存会话
   * @param aiStream AiStreamService，通过 AI SDK UI Message Stream 流式作答
   * @param retrieval HybridRetrievalService，kh_chunk 混合检索
   * @param sessions ChatSessionService，管理当前用户的 AI 会话与消息
   */
  constructor(
    private readonly aiChat: AiChatService,
    private readonly aiStream: AiStreamService,
    private readonly retrieval: HybridRetrievalService,
    private readonly sessions: ChatSessionService,
  ) {}

  /**
   * @description POST /rag/search：RAG 混合检索（关键词 BM25 + 向量 kNN → RRF → rerank），不调 LLM，只返回 kh_chunk 命中
   * @param dto RagSearchDto，请求体：query 必填，topK 默认 5、最大 20
   * @param user AuthUser，当前登录用户，用于限制可见文档
   * @returns Promise<ChunkHit[]>，最相关的可见块
   */
  @Post('rag/search')
  @RequirePermission(PermissionCode.search)
  search(@Body() dto: RagSearchDto, @CurrentUser() user: AuthUser) {
    return this.retrieval.retrieve(dto.query.trim(), dto.topK ?? 5, user);
  }

  /**
   * @description POST /ai/chat：RAG 对话，混合检索后作答并写入当前用户会话
   * @param dto ChatDto，请求体：content 必填、topK 默认 5、sessionId 可选
   * @param user AuthUser，当前登录用户
   * @returns Promise<ChatResult>，会话 ID、回答与引用资料
   */
  @Post('ai/chat')
  @RequirePermission(PermissionCode.search)
  chat(@Body() dto: ChatDto, @CurrentUser() user: AuthUser) {
    return this.aiChat.chat(dto.content, dto.topK ?? 5, user, dto.sessionId);
  }

  /**
   * @description POST /ai/chat/stream：LangChain Agent 流式作答，经 @ai-sdk/langchain 转成 UI Message Stream
   * @param dto ChatStreamDto，AI SDK useChat 消息、可选会话 ID 与 topK
   * @param user AuthUser，当前登录用户
   * @param response Response，Nest Express 原始响应
   * @returns Promise<void>，流式响应由 AiStreamService 直接写入
   */
  @Post('ai/chat/stream')
  @RequirePermission(PermissionCode.search)
  streamChat(
    @Body() dto: ChatStreamDto,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    return this.aiStream.streamChat(dto, user, response);
  }

  /**
   * @description GET /ai/sessions：分页查询当前用户的会话
   * @param query QuerySessionDto，分页参数
   * @param user AuthUser，当前登录用户
   * @returns Promise，会话分页结果
   */
  @Get('ai/sessions')
  @RequirePermission(PermissionCode.search)
  listSessions(@Query() query: QuerySessionDto, @CurrentUser() user: AuthUser) {
    return this.sessions.pageMine(user.userId, query);
  }

  /**
   * @description POST /ai/sessions：为当前用户新建空会话
   * @param dto CreateSessionDto，可选会话标题
   * @param user AuthUser，当前登录用户
   * @returns Promise<AiSessionEntity>，新建会话
   */
  @Post('ai/sessions')
  @RequirePermission(PermissionCode.search)
  createSession(@Body() dto: CreateSessionDto, @CurrentUser() user: AuthUser) {
    return this.sessions.create(user.userId, dto);
  }

  /**
   * @description GET /ai/sessions/:id/messages：查询当前用户指定会话的消息
   * @param id string，会话 ID
   * @param user AuthUser，当前登录用户
   * @returns Promise<AiMessageEntity[]>，按时间正序排列的消息
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  @Get('ai/sessions/:id/messages')
  @RequirePermission(PermissionCode.search)
  listMessages(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sessions.listMessages(user.userId, id);
  }

  /**
   * @description PATCH /ai/sessions/:id：重命名当前用户指定会话
   * @param id string，会话 ID
   * @param dto UpdateSessionDto，新标题
   * @param user AuthUser，当前登录用户
   * @returns Promise<AiSessionEntity>，重命名后的会话
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  @Patch('ai/sessions/:id')
  @RequirePermission(PermissionCode.search)
  renameSession(
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessions.rename(user.userId, id, dto);
  }

  /**
   * @description DELETE /ai/sessions/:id：删除当前用户指定会话及消息
   * @param id string，会话 ID
   * @param user AuthUser，当前登录用户
   * @returns Promise<{ message: string }>，固定返回“已删除”
   * @throws NotFoundException 会话不存在或不属于当前用户
   */
  @Delete('ai/sessions/:id')
  @RequirePermission(PermissionCode.search)
  removeSession(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sessions.remove(user.userId, id);
  }
}

export { AiController };
