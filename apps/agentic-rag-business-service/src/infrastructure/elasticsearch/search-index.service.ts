import { errors, Client } from '@elastic/elasticsearch';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SEARCH_DOCUMENT_INDEX as ES_INDEX,
  IK_TEXT_FIELD,
} from './constants/search-index.constants';
import type {
  SearchDocumentsParams,
  SearchDocumentsResult,
  SearchIndexDocument,
} from './type/search-document.types';

/**
 * 文档级全文搜索索引
 *
 * 与 RAG 向量索引的区别：
 * - 这里是「整篇文档」一条记录（标题/摘要/全文），给关键词搜索用
 * - RAG 是「多块 + 向量」，给后续对话检索预留
 *
 * 写入 Elasticsearch `kh_document`；ES 初始化失败阻断启动，写入 / 删除失败向上传播（交给 MQ 边界 nack）。
 * 查询失败只记日志并返回空分页。
 */
@Injectable()
class SearchIndexService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchIndexService.name);
  private es!: Client;

  /**
   * @description 注入配置
   * @param config ConfigService，读取 ELASTICSEARCH_NODE
   */
  constructor(private readonly config: ConfigService) {}

  /**
   * @description 启动时连 ES 并确保 kh_document 索引与 IK 分词 mapping；失败释放连接并阻断启动
   * @returns Promise<void>，无返回值
   */
  async onModuleInit() {
    const node = this.config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.es = new Client({ node });
    try {
      const health = await this.es.cluster.health();
      this.logger.log(
        `SearchIndex ES 已连接：${node}, status=${health.status}`,
      );
      await this.ensureEsIndex();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`搜索索引初始化失败：${message}`);
      await this.es.close().catch(() => undefined);
      throw error;
    }
  }

  /**
   * @description 进程退出时关闭 ES 连接
   * @returns Promise<void>，无返回值
   */
  async onModuleDestroy() {
    await this.es?.close();
  }

  /**
   * @description 以文档 ID 覆盖写入整条搜索记录（含 Mongo 全文），重复消费不会新增副本；
   * indexedAt 是消费时间，refresh 使写入立即可检索
   * @param doc SearchIndexDocument，由 PipelineOrchestrator 从 Postgres + Mongo 组装
   * @returns Promise<void>，写入失败向上抛
   */
  async indexDocument(doc: SearchIndexDocument) {
    // 不用「ES 不可用则 return」：正常返回会使 MQ ack，造成未索引却被当作成功。
    const id = String(doc.id);
    await this.es.index({
      index: ES_INDEX,
      id,
      document: {
        ...doc,
        indexedAt: new Date().toISOString(),
      },
      refresh: true,
    });
    this.logger.log(`搜索索引已写入 ES：documentId=${id}`);
  }

  /**
   * @description 下架 / 删除时从 ES 移除；文档本就不在索引中（404）视为成功
   * @param documentId string，文档 ID（即 ES _id）
   * @returns Promise<void>，非 404 的失败向上抛
   */
  async deleteDocument(documentId: string) {
    try {
      await this.es.delete({
        index: ES_INDEX,
        id: documentId,
        refresh: true,
      });
    } catch (error) {
      // 已不存在视为幂等成功；连接、权限等失败必须让消费者感知，不能误报删除成功。
      if (!(error instanceof errors.ResponseError && error.statusCode === 404))
        throw error;
    }
    this.logger.log(`搜索索引已删除：documentId=${documentId}`);
  }

  /**
   * @description 关键词检索 kh_document：标题 / 摘要 / 正文多字段匹配，可按分类、作者过滤，返回高亮片段；
   * ES 查询失败只记日志并返回空分页，不抛错
   * @param params SearchDocumentsParams，keyword 必填；page 默认 1；pageSize 默认 10、最大 50；categoryId / authorId 可选过滤
   * @returns Promise<SearchDocumentsResult>，items 为命中列表（不含正文，正文只以高亮片段返回），total 为命中总数
   */
  async searchDocuments(
    params: SearchDocumentsParams,
  ): Promise<SearchDocumentsResult> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 10, 50);
    // 跳过前几页的条数（ES from）
    const from = (page - 1) * pageSize;

    // filter 条件：精确匹配 keyword 字段，只筛选不参与打分
    const filters: Record<string, unknown>[] = [];
    if (params.categoryId) {
      filters.push({ term: { categoryId: params.categoryId } });
    }
    if (params.authorId) {
      filters.push({ term: { authorId: params.authorId } });
    }

    const keyword = params.keyword.trim();
    // multi_match：一个关键词同时查多个字段；title^3 / summary^2 表示标题、摘要命中的得分权重比正文大
    const match = {
      multi_match: {
        query: keyword,
        fields: ['title^3', 'summary^2', 'content'],
        analyzer: 'ik_smart',
      },
    };
    // 有过滤条件时用 bool：must 参与打分，filter 只筛选
    const query =
      filters.length > 0 ? { bool: { must: [match], filter: filters } } : match;

    try {
      // POST /kh_document/_search
      const response = await this.es.search({
        // 查哪个索引
        index: ES_INDEX,
        // 分页：from 跳过条数，size 本页条数
        from,
        size: pageSize,
        // 匹配条件（上面组装的 multi_match / bool）
        query,
        // 列表不回传全文，仍用 content 做匹配与高亮
        _source: {
          excludes: ['content'],
        },
        // 命中片段打 <em>，给前端做摘要；正文最多 3 段、标题整段不高亮切片
        highlight: {
          fields: {
            // number_of_fragments: 0 → 返回整个标题，不切片
            title: { number_of_fragments: 0 },
            // 正文：每段约 160 字，最多 3 段
            content: { fragment_size: 160, number_of_fragments: 3 },
            // 摘要：每段约 120 字，最多 1 段
            summary: { fragment_size: 120, number_of_fragments: 1 },
          },
        },
      });

      // hits.total 在 ES 8 是 { value, relation }，兼容旧版的数字形式
      const totalRaw = response.hits.total;
      const total =
        typeof totalRaw === 'number' ? totalRaw : (totalRaw?.value ?? 0);

      // hits.hits：本页命中文档；_source 是存进去的字段（已排除 content），highlight 是高亮片段
      const items = (response.hits.hits ?? []).map((hit) => {
        const src = (hit._source ?? {}) as Record<string, unknown>;
        const highlight = hit.highlight ?? {};
        return {
          id: String(src.id ?? hit._id),
          title: src.title ?? '',
          summary: src.summary ?? null,
          categoryId: src.categoryId ?? null,
          tags: src.tags ?? null,
          authorId: src.authorId ?? null,
          status: src.status ?? null,
          publishTime: src.publishTime ?? null,
          // _score：相关度得分，越高越相关（结果默认按它降序）
          score: hit._score ?? 0,
          highlight: {
            title: highlight.title ?? [],
            summary: highlight.summary ?? [],
            content: highlight.content ?? [],
          },
        };
      });

      return { items, total, page, pageSize };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`搜索查询失败：keyword=${keyword}, ${message}`);
      return { items: [], total: 0, page, pageSize };
    }
  }

  /**
   * @description 索引不存在则创建（title / summary / content 用 IK 分词）；已存在则不动
   * @returns Promise<void>，无返回值
   */
  private async ensureEsIndex() {
    // HEAD /kh_document：索引是否存在；已存在则不动
    const exists = await this.es.indices.exists({ index: ES_INDEX });
    if (exists) return;
    try {
      // PUT /kh_document：建索引并定义字段类型（mapping）
      await this.es.indices.create({
        index: ES_INDEX,
        mappings: {
          properties: {
            // 文档 ID：keyword 不分词，只做精确匹配
            id: { type: 'keyword' },
            // 标题 / 摘要 / 正文：text + IK 中文分词，参与全文检索
            title: IK_TEXT_FIELD,
            summary: IK_TEXT_FIELD,
            content: IK_TEXT_FIELD,
            // 标签（逗号分隔原文）：keyword，只做精确匹配
            tags: { type: 'keyword' },
            // 文档状态码
            status: { type: 'integer' },
            // 分类 / 作者 ID：keyword，供 term 过滤
            categoryId: { type: 'keyword' },
            authorId: { type: 'keyword' },
            // 发布时间：ISO-8601 字符串
            publishTime: { type: 'date' },
          },
        },
      });
    } catch (error) {
      // 多实例同时启动时另一实例可能已建索引，仅忽略该明确冲突。
      if (!(
        error instanceof errors.ResponseError &&
        error.body?.error?.type === 'resource_already_exists_exception'
      ))
        throw error;
    }
    this.logger.log(`已创建 ES 索引：${ES_INDEX}`);
  }
}

export { SearchIndexService };
