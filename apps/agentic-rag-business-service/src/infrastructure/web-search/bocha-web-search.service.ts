import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BochaWebSearchResponseSchema } from './schemas/bocha-web-search-response.zod';
import type { WebSearchResult } from './type/web-search.types';

/** 博查 Web Search 客户端，用于知识库不足时查询公开网页 */
@Injectable()
class BochaWebSearchService {
  private readonly logger = new Logger(BochaWebSearchService.name);

  /**
   * @description 注入运行时配置
   * @param config ConfigService，读取可选 BOCHA_API_KEY
   */
  constructor(private readonly config: ConfigService) {}

  /**
   * @description 调用博查 Web Search；未配置 Key、HTTP 失败或响应异常时返回带 error 的空结果
   * @param query string，搜索关键词
   * @param count number，期望条数，限制在 1-10，默认 5
   * @returns Promise<WebSearchResult>，公开网页标题、链接、摘要和可选站点名
   */
  async search(query: string, count = 5): Promise<WebSearchResult> {
    const apiKey = this.config.get<string>('BOCHA_API_KEY');
    if (!apiKey) {
      return {
        query,
        items: [],
        error: '未配置 BOCHA_API_KEY，无法联网搜索',
      };
    }

    const response = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        freshness: 'noLimit',
        summary: true,
        count: Math.min(Math.max(count, 1), 10),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.warn(`博查搜索失败：status=${response.status}`);
      return {
        query,
        items: [],
        error: `搜索失败（${response.status}）${detail.slice(0, 120)}`,
      };
    }

    const parsed = BochaWebSearchResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      this.logger.warn('博查搜索响应结构异常');
      return { query, items: [], error: '搜索接口返回异常' };
    }

    const json = parsed.data;
    if (json.code !== 200 || !json.data) {
      return {
        query,
        items: [],
        error: json.msg ?? '搜索接口返回异常',
      };
    }

    const items = (json.data.webPages?.value ?? [])
      .filter((page): page is typeof page & { name: string; url: string } =>
        Boolean(page.url && page.name),
      )
      .map((page) => ({
        title: page.name,
        url: page.url,
        snippet: (page.summary || page.snippet || '').trim(),
        siteName: page.siteName,
      }));
    return { query, items };
  }
}

export { BochaWebSearchService };
