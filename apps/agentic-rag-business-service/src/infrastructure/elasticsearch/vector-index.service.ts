import { Client, type estypes } from '@elastic/elasticsearch';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DocumentAccessScope,
  DocumentVisibility,
} from '../../common/type/document-access.types';
import { CHUNK_INDEX } from './constants/vector-index.constants';
import { buildChunkDocument } from './helpers/build-chunk-document';
import {
  buildEsVisibilityFilter,
  ES_CHUNK_VISIBILITY_FIELDS,
  wrapEsQueryWithVisibility,
} from './helpers/document-visibility';
import { mapChunkHits } from './helpers/map-chunk-hits';
import { rrfFuse } from './helpers/rrf-fuse';
import type { ChunkHit, HybridSearchParams } from './type/chunk-hit.types';
import type { IndexableChunk } from './type/indexable-chunk.types';

/** 检索 kh_chunk 时回传的字段（不含 embedding） */
const CHUNK_HIT_SOURCE_FIELDS = [
  'chunk_id',
  'document_id',
  'document_title',
  'content',
  'heading',
];

/**
 * @description 把召回条数限制在 1-50
 * @param topK number，调用方传入的条数
 * @returns number，限制后的条数
 */
function clampTopK(topK: number): number {
  return Math.min(Math.max(topK, 1), 50);
}

/**
 * 向量索引存储
 *
 * 写入 Elasticsearch `kh_chunk`，字段含 dense_vector(embedding)，供后续 kNN / 混合检索。
 *
 * 职责：
 * - 启动时确保索引 mapping 存在（含 dense_vector）
 * - 按 document_id 删除旧块（重建前先清）
 * - bulk 写入带 embedding 的 chunk
 * - 检索：BM25 关键词、kNN 向量、两路 RRF 融合（供 /rag/search、/ai/chat）；查询失败只记日志并返回 []
 *
 * 连不上集群会阻断启动，与 Postgres / Mongo / RabbitMQ 一样视为本服务基建。
 */
@Injectable()
class VectorIndexService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VectorIndexService.name);
  private es!: Client;
  private readonly embeddingDims: number;

  /**
   * @description 注入配置并读取向量维度
   * @param config ConfigService，读取 EMBEDDING_DIMENSION、ELASTICSEARCH_NODE
   */
  constructor(private readonly config: ConfigService) {
    this.embeddingDims = this.config.getOrThrow<number>('EMBEDDING_DIMENSION');
  }

  /**
   * @description 启动时连 ES、检查集群并确保 kh_chunk 索引存在；失败释放连接并阻断启动
   * @returns Promise<void>，无返回值
   */
  async onModuleInit(): Promise<void> {
    const node = this.config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.es = new Client({ node });
    try {
      const health = await this.es.cluster.health();
      this.logger.log(
        `VectorIndex ES 已连接：${node}, status=${health.status}`,
      );
      await this.createIndexIfNotExists();
      await this.ensureVisibilityMapping();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Elasticsearch 初始化失败：${message}`);
      await this.es.close().catch(() => undefined);
      throw error;
    }
  }

  /**
   * @description 进程退出时关闭 ES 连接
   * @returns Promise<void>，无返回值
   */
  async onModuleDestroy(): Promise<void> {
    await this.es?.close();
  }

  /**
   * @description 已发布文档只改公开或团队时，批量更新全部向量块的可见性字段，不重算 embedding
   * @param documentId string，文档 ID
   * @param visibility DocumentVisibility，公开、团队与作者字段
   * @returns Promise<void>，失败只记 warn，不回滚文档保存
   */
  async updateVisibility(
    documentId: string,
    visibility: DocumentVisibility,
  ): Promise<void> {
    try {
      const result = await this.es.updateByQuery({
        index: CHUNK_INDEX,
        refresh: true,
        query: { term: { document_id: documentId } },
        script: {
          source:
            'ctx._source.is_public = params.is_public; ctx._source.team_id = params.team_id; ctx._source.author_id = params.author_id;',
          params: {
            is_public: visibility.isPublic,
            team_id: visibility.teamId,
            author_id: visibility.authorId,
          },
        },
      });
      this.logger.log(
        `向量块可见性已更新：documentId=${documentId}, updated=${result.updated ?? 0}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `向量块可见性更新失败：documentId=${documentId}, ${message}`,
      );
    }
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
   * @description 按 document_id 删除该文档在 kh_chunk 里的全部块
   * @param documentId string，文档 ID（雪花 ID 字符串）
   * @returns Promise<void>，索引不存在视为成功；其他失败向上抛
   */
  async deleteByDocId(documentId: string): Promise<void> {
    try {
      // POST /kh_chunk/_delete_by_query：删除所有匹配条件的文档
      await this.es.deleteByQuery({
        index: CHUNK_INDEX,
        query: {
          // term：精确匹配 keyword，不会误删其它文档的块
          term: { document_id: documentId },
        },
        // 删完立即刷新，后续写入看不到旧块
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
   * @description bulk 写入 / 覆盖带 embedding 的块
   * @param chunks IndexableChunk[]，分块 + 向量化后的块；空数组直接返回
   * @returns Promise<void>，有任意一条失败就抛错
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
   * @description BM25 关键词检索 kh_chunk：匹配块正文与文档标题（ik_smart 分词）；ES 查询失败只记日志并返回 []
   * @param query string，用户问题原文（前后空白会去掉，空串直接返回 []）
   * @param topK number，最多返回条数，默认 20，限制 1-50
   * @param scope DocumentAccessScope | undefined，当前用户可见范围
   * @returns Promise<ChunkHit[]>，按 BM25 得分降序的块
   */
  async keywordSearch(
    query: string,
    topK = 20,
    scope?: DocumentAccessScope,
  ): Promise<ChunkHit[]> {
    // 空问题不查
    const trimmed = query.trim();
    if (!trimmed) return [];

    const k = clampTopK(topK);
    const visibilityFilter = scope
      ? buildEsVisibilityFilter(scope, ES_CHUNK_VISIBILITY_FIELDS)
      : null;
    try {
      // POST /kh_chunk/_search
      const response = await this.es.search({
        index: CHUNK_INDEX,
        // 返回条数
        size: k,
        query: wrapEsQueryWithVisibility(
          {
            // 一个关键词同时查多个字段
            multi_match: {
              query: trimmed,
              // 文档标题命中权重 2，块正文权重 1
              fields: ['document_title^2', 'content'],
              // 检索时用粗粒度中文分词
              analyzer: 'ik_smart',
            },
          },
          visibilityFilter,
        ) as estypes.QueryDslQueryContainer,
        // 只取需要的字段，不回传 embedding（1024 维太大）
        _source: CHUNK_HIT_SOURCE_FIELDS,
      });
      // hits.hits：按 _score（BM25 分）降序的命中
      return mapChunkHits(response.hits.hits);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`关键词检索失败：${message}`);
      return [];
    }
  }

  /**
   * @description kNN 向量检索 kh_chunk（余弦相似度）；ES 查询失败只记日志并返回 []
   * @param queryVector number[]，问题向量（与 EMBEDDING_DIMENSION 同维）；空数组直接返回 []
   * @param topK number，最多返回条数，默认 20，限制 1-50
   * @param scope DocumentAccessScope | undefined，当前用户可见范围
   * @returns Promise<ChunkHit[]>，按相似度降序的块
   */
  async knnSearch(
    queryVector: number[],
    topK = 20,
    scope?: DocumentAccessScope,
  ): Promise<ChunkHit[]> {
    if (!queryVector.length) return [];

    const k = clampTopK(topK);
    const visibilityFilter = scope
      ? buildEsVisibilityFilter(scope, ES_CHUNK_VISIBILITY_FIELDS)
      : null;
    try {
      const knn: estypes.KnnSearch = {
        field: 'embedding',
        query_vector: queryVector,
        k,
        num_candidates: Math.max(k * 10, 50),
      };
      if (visibilityFilter) {
        knn.filter = visibilityFilter as estypes.QueryDslQueryContainer;
      }
      // POST /kh_chunk/_search
      const response = await this.es.search({
        index: CHUNK_INDEX,
        // 返回条数
        size: k,
        knn,
        // 只取需要的字段，不回传 embedding
        _source: CHUNK_HIT_SOURCE_FIELDS,
      });
      // hits.hits：按 _score（余弦相似度换算的分）降序的命中
      return mapChunkHits(response.hits.hits);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`向量检索失败：${message}`);
      return [];
    }
  }

  /**
   * @description 混合检索粗排：关键词与向量两路并行召回，再按 chunkId 做 RRF 融合；
   * 没有问题向量（嵌入失败）时只走关键词
   * @param params HybridSearchParams，query、可选问题向量、召回参数和文档可见范围
   * @returns Promise<ChunkHit[]>，按 RRF 分降序的去重结果
   */
  async searchHybrid(params: HybridSearchParams): Promise<ChunkHit[]> {
    // 每一路召回条数
    const hybridTopK = clampTopK(params.hybridTopK ?? 20);
    // RRF 常数非法（<= 0）时用 60
    const rrfC = params.rrfC && params.rrfC > 0 ? params.rrfC : 60;

    // 两路并行：关键词总是查；有问题向量才查 kNN，否则这一路为空
    const [keywordHits, vectorHits] = await Promise.all([
      this.keywordSearch(params.query, hybridTopK, params.scope),
      params.queryVector?.length
        ? this.knnSearch(params.queryVector, hybridTopK, params.scope)
        : Promise.resolve([] as ChunkHit[]),
    ]);

    // 按 chunkId 合并两路，按 RRF 分降序
    const fused = rrfFuse(keywordHits, vectorHits, rrfC);
    this.logger.log(
      `混合检索 RRF：keyword=${keywordHits.length}, vector=${vectorHits.length}, fused=${fused.length}`,
    );
    return fused;
  }

  /**
   * @description 为已有 kh_chunk 索引补充可见性 mapping；重复执行幂等
   * @returns Promise<void>，更新失败只记 warn，查询仍按现有 mapping 运行
   */
  private async ensureVisibilityMapping(): Promise<void> {
    try {
      await this.es.indices.putMapping({
        index: CHUNK_INDEX,
        properties: {
          is_public: { type: 'boolean' },
          author_id: { type: 'keyword' },
          team_id: { type: 'keyword' },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`kh_chunk 可见性 mapping 更新失败：${message}`);
    }
  }

  /**
   * 创建 kh_chunk 索引（dense_vector + IK）。
   * document_id 用 keyword：雪花 ID 以字符串传递，避免 JS long 精度问题。
   * @description 索引不存在才创建（标题 / 正文用 IK 分词，embedding 为 dense_vector）；已存在不动，旧索引不会自动改成 IK
   * @returns Promise<void>，并发创建导致的「已存在」忽略，其他失败向上抛
   */
  private async createIndexIfNotExists(): Promise<void> {
    // HEAD /kh_chunk：索引是否存在；已存在不动
    const exists = await this.es.indices.exists({ index: CHUNK_INDEX });
    if (exists) {
      return;
    }

    try {
      // PUT /kh_chunk：建索引（settings + mapping）
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
              // 写入细切、检索粗切（IK 中文分词）
              analyzer: 'ik_max_word',
              search_analyzer: 'ik_smart',
              fields: { keyword: { type: 'keyword' } },
            },
            // BM25 / 混合检索正文
            content: {
              type: 'text',
              analyzer: 'ik_max_word',
              search_analyzer: 'ik_smart',
            },
            // 章节标题按原文精确过滤，不做分词
            heading: { type: 'keyword' },
            chunk_index: { type: 'integer' },
            total_chunks: { type: 'integer' },
            // 权限与分类过滤：雪花 ID，只做 term
            category_id: { type: 'keyword' },
            author_id: { type: 'keyword' },
            team_id: { type: 'keyword' },
            is_public: { type: 'boolean' },
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
