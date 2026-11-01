import { Client } from '@elastic/elasticsearch';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CHUNK_INDEX } from './constants/vector-index.constants';
import { buildChunkDocument } from './helpers/build-chunk-document';
import type { IndexableChunk } from './type/indexable-chunk.types';

/**
 * 向量索引存储
 *
 * 写入 Elasticsearch `kh_chunk`，字段含 dense_vector(embedding)，供后续 kNN / 混合检索。
 *
 * 职责：
 * - 启动时确保索引 mapping 存在（含 dense_vector）
 * - 按 document_id 删除旧块（重建前先清）
 * - bulk 写入带 embedding 的 chunk
 *
 * 连不上集群会阻断启动，与 Postgres / Mongo / RabbitMQ 一样视为本服务基建。
 */
@Injectable()
class VectorIndexService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VectorIndexService.name);
  private es!: Client;
  private readonly embeddingDims: number;

  constructor(private readonly config: ConfigService) {
    this.embeddingDims = this.config.getOrThrow<number>('EMBEDDING_DIMENSION');
  }

  async onModuleInit(): Promise<void> {
    const node = this.config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.es = new Client({ node });
    try {
      const health = await this.es.cluster.health();
      this.logger.log(
        `VectorIndex ES 已连接：${node}, status=${health.status}`,
      );
      await this.createIndexIfNotExists();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Elasticsearch 初始化失败：${message}`);
      await this.es.close().catch(() => undefined);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.es?.close();
  }

  /**
   * 按 document_id 删除该文档在 `kh_chunk` 中的全部向量块。
   *
   * 由管线在重建前调用：先清旧块再 `indexChunks`，避免重复发布留下脏 chunk。
   * 关联键是 mapping 里的 `document_id`（keyword / 雪花 ID 字符串），不是 ES `_id`。
   *
   * 边界：
   * - 索引尚未创建时视为无旧块，吞掉 `index_not_found` 后返回
   * - 其余失败必须抛出，避免「删失败却继续写入」造成新旧块并存
   * - `refresh: true` 让后续 bulk 立刻看不到已删文档，而不是等 refresh_interval
   */
  async deleteByDocId(documentId: string): Promise<void> {
    try {
      await this.es.deleteByQuery({
        index: CHUNK_INDEX,
        query: {
          // term：精确匹配 keyword，不会误删其它文档的块
          term: { document_id: documentId },
        },
        refresh: true,
      });
      this.logger.log(`已从 ES 删除文档向量块：documentId=${documentId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 首次重建 / 索引被删后，没有可清的旧块
      if (message.includes('index_not_found')) {
        return;
      }
      this.logger.error(
        `ES 删除文档块失败：documentId=${documentId}, error=${message}`,
      );
      throw error;
    }
  }

  /**
   * bulk 写入 / 覆盖带 embedding 的 chunk。
   *
   * 管线在分块 + Embedding 完成后调用；调用方应已先 `deleteByDocId`。
   * ES `_id` = `chunkId`：同一 chunk 重复写入是覆盖，不是追加。
   *
   * 边界：
   * - 空数组直接返回，不打 ES
   * - 写入前确保索引存在（冷启动或索引被删后的兜底）
   * - bulk 本身不抛部分失败：必须检查 `response.errors`，有失败则整批视为失败并抛出
   * - `refresh: true` 覆盖索引级 5s refresh_interval，写完即可被检索
   */
  async indexChunks(chunks: IndexableChunk[]): Promise<void> {
    if (!chunks.length) {
      return;
    }

    await this.createIndexIfNotExists();

    // bulk 协议：一次请求写多条，每条由「动作行 + 数据行」两行成对组成
    // - 动作行：指令，告诉 ES 对下一行数据做什么、写到哪里（本身不存储）
    // - 数据行：真正要存的文档字段
    // flatMap 把每个块的 [动作, 数据] 拍平成 [动作1, 数据1, 动作2, 数据2, ...]
    const operations = chunks.flatMap((chunk) => [
      // 动作行：index = 写入，_id 已存在则整条覆盖（类比 INSERT ... ON CONFLICT DO UPDATE）
      // _index = 写到 kh_chunk 索引（类比表名）；_id = chunkId（类比主键，同一文档重建时不变）
      { index: { _index: CHUNK_INDEX, _id: chunk.chunkId } },
      // 数据行：驼峰字段转成 ES 的下划线字段（chunk_id、content、embedding 等）
      buildChunkDocument(chunk),
    ]);

    // POST /_bulk：客户端把 operations 转成「一行一个 JSON」的请求体发出
    const response = await this.es.bulk({
      // 写完立即刷新索引，返回后马上能搜到（否则要等索引的 refresh_interval）
      refresh: true,
      operations,
    });

    // 部分失败时 bulk 仍返回 200、不抛异常，必须自己检查 errors
    if (response.errors) {
      // items 与请求里的块一一对应，挑出失败的条目，记录「_id: 失败原因」
      const failed = response.items
        .filter((item) => item.index?.error)
        .map(
          (item) =>
            `${item.index?._id}: ${item.index?.error?.reason ?? 'unknown'}`,
        );
      this.logger.error(`ES 批量索引部分失败：${failed.join(', ')}`);
      throw new Error(`ES 批量索引部分失败：${failed.length} 条`);
    }

    this.logger.log(
      `ES 批量索引成功：${chunks.length} chunks → ${CHUNK_INDEX}`,
    );
  }

  /**
   * 创建 kh_chunk 索引（含 dense_vector）。
   * document_id 用 keyword：雪花 ID 以字符串传递，避免 JS long 精度问题。
   */
  private async createIndexIfNotExists(): Promise<void> {
    const exists = await this.es.indices.exists({ index: CHUNK_INDEX });
    if (exists) {
      return;
    }

    try {
      await this.es.indices.create({
        index: CHUNK_INDEX,
        // 索引配置
        settings: {
          // 单分片：本地 / 单节点规模足够；改分片数必须重建索引
          number_of_shards: 1,
          // 无副本：Compose 单节点 ES 无法分配 replica，否则一直 yellow
          number_of_replicas: 0,
          // 批量写入期间降低 refresh 频率；indexChunks 仍带 refresh:true
          refresh_interval: '5s',
        },
        // 字段 mapping
        mappings: {
          properties: {
            // 精确匹配 / 去重；雪花 ID 以字符串写入，避免 JS long 精度丢失
            chunk_id: { type: 'keyword' },
            // deleteByQuery 按 document_id term 清旧块，必须 keyword
            document_id: { type: 'keyword' },
            // text 供标题全文检索；keyword 子字段供精确过滤 / 聚合
            document_title: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } },
            },
            // BM25 / 混合检索正文
            content: { type: 'text' },
            // 章节标题按原文精确过滤，不做分词
            heading: { type: 'keyword' },
            chunk_index: { type: 'integer' },
            total_chunks: { type: 'integer' },
            // 权限与分类过滤：雪花 ID，只做 term
            category_id: { type: 'keyword' },
            author_id: { type: 'keyword' },
            team_id: { type: 'keyword' },
            doc_status: { type: 'integer' },
            publish_time: { type: 'date' },
            indexed_at: { type: 'date' },
            // dims 来自 EMBEDDING_DIMENSION；改维度必须删索引重建
            embedding: {
              type: 'dense_vector',
              dims: this.embeddingDims,
              index: true,
              // 与 Qwen embedding 归一化向量对齐，供后续 kNN
              similarity: 'cosine',
            },
          },
        },
      });
      this.logger.log(
        `ES 索引创建成功：index=${CHUNK_INDEX}, dims=${this.embeddingDims}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('resource_already_exists')) {
        return;
      }
      this.logger.error(`ES 索引创建失败：${message}`);
      throw error;
    }
  }
}

export { VectorIndexService };
