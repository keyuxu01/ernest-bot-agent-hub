import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryClient, type Message } from 'mem0ai';
import { Mem0SearchResponseSchema } from './schemas/mem0-search-response.zod';

/** Mem0 Platform 云客户端；未配置 Key 时保持禁用，不建立外部连接 */
@Injectable()
class Mem0MemoryService {
  private readonly logger = new Logger(Mem0MemoryService.name);
  private readonly client?: MemoryClient;

  /**
   * @description 从环境变量构造可选 Mem0 Platform 客户端
   * @param config ConfigService，读取 MEM0_API_KEY
   */
  constructor(config: ConfigService) {
    const apiKey = config.get<string>('MEM0_API_KEY');
    if (!apiKey) {
      this.logger.warn('未配置 MEM0_API_KEY，跳过长期记忆');
      return;
    }
    this.client = new MemoryClient({ apiKey });
  }

  /** 是否已配置 Mem0 Platform */
  get enabled(): boolean {
    return Boolean(this.client);
  }

  /**
   * @description 按过滤条件搜索长期记忆并在边界校验响应
   * @param query string，搜索文本
   * @param filters Record<string, unknown>，Mem0 用户/会话过滤条件
   * @param topK number，最多返回条数
   * @returns Promise<string[]>，非空记忆文本
   * @throws Error Mem0 未配置、请求失败或响应结构异常
   */
  async search(
    query: string,
    filters: Record<string, unknown>,
    topK: number,
  ): Promise<string[]> {
    if (!this.client) throw new Error('Mem0 未配置');
    const response = Mem0SearchResponseSchema.parse(
      await this.client.search(query, { filters, topK }),
    );
    return response.results
      .map((item) => item.memory)
      .filter((memory): memory is string => Boolean(memory));
  }

  /**
   * @description 让 Mem0 从用户消息中抽取并写入记忆
   * @param messages Message[]，仅包含用户原话
   * @param options object，用户 ID、可选会话 ID和抽取指令
   * @returns Promise<void>，写入完成后无返回值
   * @throws Error Mem0 未配置或写入失败
   */
  async add(
    messages: Message[],
    options: {
      userId: string;
      runId?: string;
      customInstructions: string;
    },
  ): Promise<void> {
    if (!this.client) throw new Error('Mem0 未配置');
    await this.client.add(messages, options);
  }

  /**
   * @description 删除某用户指定会话层的全部记忆，不影响用户层记忆
   * @param userId string，用户 ID
   * @param sessionId string，会话 ID，对应 Mem0 runId
   * @returns Promise<void>，删除完成后无返回值
   * @throws Error Mem0 未配置或删除失败
   */
  async clearSession(userId: string, sessionId: string): Promise<void> {
    if (!this.client) throw new Error('Mem0 未配置');
    await this.client.deleteAll({ userId, runId: sessionId });
  }
}

export { Mem0MemoryService };
