import { HumanMessage } from '@langchain/core/messages';
import { toUIMessageStream } from '@ai-sdk/langchain';
import { Injectable, Logger } from '@nestjs/common';
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import type { Response } from 'express';
import { createAgent, modelCallLimitMiddleware, tool } from 'langchain';
import { z } from 'zod';
import { ChatModelService } from '../../infrastructure/chat-model/chat-model.service';
import type { ChunkHit } from '../../infrastructure/elasticsearch/type/chunk-hit.types';
import { BochaWebSearchService } from '../../infrastructure/web-search/bocha-web-search.service';
import type { AuthUser } from '../user/type/user.types';
import { ChatSessionService } from './chat-session.service';
import { AI_STREAM_SYSTEM_PROMPT } from './constants/ai-chat.constants';
import type { ChatStreamDto } from './dto/chat-stream.dto';
import { buildContext, toSources } from './helpers/rag-answer';
import { lastUserText } from './helpers/last-user-text';
import { mapReasoningStream } from './helpers/map-reasoning-stream';
import { titleFromQuestion } from './helpers/title-from-question';
import { HybridRetrievalService } from './hybrid-retrieval.service';
import type { ChatSource } from './type/ai-chat.types';
import type { RagBusinessAiStreamMessage } from './type/ai-stream.types';

/**
 * AI SDK UI Message Stream 编排：会话 → RAG → LangChain Agent → 可选博查搜索 → 问答落库。
 * 百炼思考内容经 helper 映射成 AI SDK reasoning 事件。
 */
@Injectable()
class AiStreamService {
  private readonly logger = new Logger(AiStreamService.name);
  private readonly agent: ReturnType<typeof createAgent>;

  /**
   * @description 构建带 web_search 工具和模型调用上限的 LangChain Agent
   * @param chatModel ChatModelService，提供开启流式与可选思考的千问模型
   * @param retrieval HybridRetrievalService，检索知识库资料
   * @param sessions ChatSessionService，维护用户会话并持久化问答
   * @param webSearch BochaWebSearchService，知识库不足时查询公开网页
   */
  constructor(
    chatModel: ChatModelService,
    private readonly retrieval: HybridRetrievalService,
    private readonly sessions: ChatSessionService,
    private readonly webSearch: BochaWebSearchService,
  ) {
    this.agent = createAgent({
      model: chatModel.streamAnswerModel,
      tools: [
        tool(
          async (input: { query: string; count?: number }) =>
            this.webSearch.search(input.query, input.count ?? 5),
          {
            name: 'web_search',
            description:
              '联网搜索（博查）。知识库不足、需要最新公开信息或外部资料时再调用。不要用它替代知识库已有内容。',
            schema: z.object({
              query: z.string().min(1).describe('搜索关键词'),
              count: z
                .number()
                .int()
                .min(1)
                .max(10)
                .optional()
                .describe('条数，默认 5'),
            }),
          },
        ),
      ],
      systemPrompt: AI_STREAM_SYSTEM_PROMPT,
      middleware: [
        // 单次请求最多调用 4 次模型，避免 web_search 循环；超限时正常结束。
        modelCallLimitMiddleware({ runLimit: 4, exitBehavior: 'end' }),
      ],
    });
  }

  /**
   * @description POST /ai/chat/stream：输出 AI SDK UI Message Stream，并在流结束后保存本轮问答
   * @param dto ChatStreamDto，AI SDK useChat 消息、可选会话 ID 与 topK
   * @param user AuthUser，当前登录用户
   * @param response Response，Nest Express 原始响应
   * @returns Promise<void>，响应内容由 AI SDK 直接写入 response
   */
  async streamChat(
    dto: ChatStreamDto,
    user: AuthUser,
    response: Response,
  ): Promise<void> {
    const question = lastUserText(dto.messages);
    const topK = dto.topK ?? 5;
    let persistSessionId = dto.sessionId;
    let persistSources: ChatSource[] = [];

    // SDK 只提供 UI Message 协议；会话、RAG、data-* 和 Agent 流在 execute 中编排。
    const stream = createUIMessageStream<RagBusinessAiStreamMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });
        if (!question) {
          writer.write({ type: 'text-start', id: 'empty' });
          writer.write({
            type: 'text-delta',
            id: 'empty',
            delta: '请输入问题。',
          });
          writer.write({ type: 'text-end', id: 'empty' });
          writer.write({ type: 'finish' });
          return;
        }

        const session = dto.sessionId
          ? await this.sessions.touchTitle(user.userId, dto.sessionId, question)
          : await this.sessions.create(user.userId, {
              title: titleFromQuestion(question),
            });
        persistSessionId = session.id;
        writer.write({
          type: 'data-session',
          data: { sessionId: session.id },
        });
        writer.write({
          type: 'data-status',
          data: { stage: 'retrieve', text: '正在检索知识库…' },
        });

        let hits: ChunkHit[] = [];
        try {
          hits = await this.retrieval.retrieve(question, topK, user);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.warn(`RAG 检索失败：${detail}`);
        }

        const sources = toSources(hits);
        persistSources = sources;
        writer.write({
          type: 'data-retrieve',
          data: {
            query: question,
            items: sources.map((source) => ({
              index: source.index,
              documentId: source.documentId,
              documentTitle: source.documentTitle,
              heading: source.heading,
            })),
          },
        });
        writer.write({ type: 'data-sources', data: sources });
        for (const source of sources) {
          writer.write({
            type: 'source-document',
            sourceId: source.documentId,
            mediaType: 'text/markdown',
            title: `[${source.index}] ${source.documentTitle}`,
          });
        }

        const prompt = hits.length
          ? `检索到的资料：\n${buildContext(hits)}\n\n用户问题：${question}`
          : `知识库没有召回到相关内容。\n\n用户问题：${question}`;
        const langchainStream = await this.agent.stream(
          { messages: [new HumanMessage(prompt)] },
          // messages 提供模型 token / 思考；tools 提供 web_search 调用事件。
          { streamMode: ['messages', 'tools'] },
        );
        // 合并后的完整事件顺序：
        // 1. 外层 start
        // 2. 外层 data-session
        // 3. 外层 data-status
        // 4. 外层 data-retrieve
        // 5. 外层 data-sources / source-document
        // 6. 内层 text-start
        // 7. 内层 text-delta / reasoning / tool 事件
        // 8. 内层 text-end
        // 9. 外层 finish
        // 10. 外层 onFinish：提取最终回答并保存本轮消息
        writer.merge(
          toUIMessageStream(mapReasoningStream(langchainStream) as never, {
            // 外层 createUIMessageStream 已经手动发送 start；这里禁用内层 start，
            // 避免 useChat 把同一次回答识别成第二条消息的开始。
            sendStart: false,
            // 内层事件合并完成后，由外层统一发送 finish 并触发 onFinish 落库；
            // 这里禁用内层 finish，避免前端提前结束 loading 或忽略后续外层事件。
            sendFinish: false,
            onError: (error) => {
              this.logger.warn(`LangChain 流失败：${error.message}`);
            },
          }) as never,
        );
      },
      onFinish: async ({ responseMessage }) => {
        const parts = responseMessage?.parts ?? [];
        const answer = parts
          .filter(
            (part): part is { type: 'text'; text: string } =>
              part.type === 'text',
          )
          .map((part) => part.text)
          .join('')
          .trim();
        const used = new Set(
          [...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])),
        );
        const sources = used.size
          ? persistSources.filter((source) => used.has(source.index))
          : [];
        if (!question || !persistSessionId) return;

        try {
          await this.sessions.appendTurn(
            user.userId,
            persistSessionId,
            question,
            answer || '未能生成回答。',
            sources,
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.warn(`流式对话落库失败：${detail}`);
        }
      },
      onError: (error) =>
        error instanceof Error ? error.message : String(error),
    });

    await pipeUIMessageStreamToResponse({ response, stream });
  }
}

export { AiStreamService };
