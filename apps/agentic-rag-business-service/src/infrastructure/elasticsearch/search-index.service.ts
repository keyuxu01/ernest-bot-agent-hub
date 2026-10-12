import { errors, Client } from '@elastic/elasticsearch';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RagBusinessSearchDocument } from '@repo/contracts';
import { SEARCH_DOCUMENT_INDEX as ES_INDEX } from './constants/search-index.constants';

/**
 * 文档级全文搜索索引
 *
 * 与 RAG 向量索引的区别：
 * - 这里是「整篇文档」一条记录（标题/摘要/正文前缀），给关键词搜索用
 * - RAG 是「多块 + 向量」，给语义检索用
 *
 * 仅写入 Elasticsearch `kh_document`；ES 初始化失败阻断启动，操作失败向上传播。
 */
@Injectable()
class SearchIndexService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchIndexService.name);
  private es!: Client;

  constructor(private readonly config: ConfigService) {}

  /** 与向量索引一致：启动时连通并确保 mapping；失败释放连接并阻断启动。 */
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

  async onModuleDestroy() {
    await this.es?.close();
  }

  /**
   * 以文档 ID 覆盖写入整条搜索记录，重复消费不会新增副本。
   * indexedAt 是消费时间，publishTime 保留发布时刻；refresh 使写入立即可检索。
   * 仅索引标题、摘要和正文前缀，不提供全文原文存储。
   * @param doc 字段约定见 DocumentService 发布时构建的版本化快照
   */
  async indexDocument(doc: RagBusinessSearchDocument) {
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

  /** 下架 / 删除时从 ES 移除 */
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

  /** 索引不存在则创建基础 mapping（text + keyword） */
  private async ensureEsIndex() {
    const exists = await this.es.indices.exists({ index: ES_INDEX });
    if (!exists) {
      try {
        await this.es.indices.create({
          index: ES_INDEX,
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: { type: 'text' },
              summary: { type: 'text' },
              content: { type: 'text' },
              tags: { type: 'keyword' },
              status: { type: 'integer' },
              categoryId: { type: 'keyword' },
              authorId: { type: 'keyword' },
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
      this.logger.log(`搜索索引已就绪：${ES_INDEX}`);
    }
  }
}

export { SearchIndexService };
