import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { type Driver } from 'neo4j-driver';
import { GRAPH_CONSTRAINT_STATEMENTS } from './constants/graph-store.constants';
import type {
  GraphChunkNode,
  GraphDocumentNode,
  GraphExtraction,
} from './type/graph-store.types';

/**
 * 知识图谱存储（Neo4j）
 *
 * 迁自 knowledge-hub-backend `bb867d5e` 的 GraphBuildService 中「写 Neo4j」部分。
 * 按项目约定，driver 与 Cypher 放在 infrastructure；分块与 LLM 抽取留在 pipeline 编排侧。
 * Cypher 除 RELATED_TO 的权重 / 来源块记录与删除时的边清理外，与源提交保持一致，便于对照后续版本。
 *
 * 职责：
 * - 启动时验证连通性并声明唯一约束
 * - 按文档 upsert (:KnowledgeDocument)
 * - 按块 upsert (:DocumentChunk) + HAS_CHUNK
 * - 写入抽取结果：实体 / MENTIONS / RELATED_TO（writeExtraction）
 *   RELATED_TO 边属性：weight 取各块证据强度最大值；chunkIds 为去重来源块，mentions = size(chunkIds)
 * - 按文档 ID 删除文档、块、只由本文档支撑的关系边，以及删除后无人提及的孤儿实体
 *
 * 边界：
 * - 与 ES / RabbitMQ 一致，连不上 Neo4j 会阻断启动；不迁入源提交
 *   「Neo4j 不可用就跳过写入」的分支 —— 跳过会让消费者正常返回并 ack，
 *   等于把未写入当成功（见 ADR-0021 / ADR-0022）。
 * - 不记录块正文，日志只带 documentId / chunkId / 计数。
 */
@Injectable()
class GraphStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GraphStoreService.name);
  private driver!: Driver;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.config.getOrThrow<string>('NEO4J_URI');
    const user = this.config.getOrThrow<string>('NEO4J_USER');
    const password = this.config.getOrThrow<string>('NEO4J_PASSWORD');
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    try {
      await this.driver.verifyConnectivity();
      this.logger.log(`Neo4j 已连接：${uri}`);
      await this.ensureConstraints();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Neo4j 初始化失败：${message}`);
      await this.driver.close().catch(() => undefined);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver?.close();
  }

  /**
   * ① 文档节点：按 id 幂等 upsert，保留首次 createdAt。
   */
  async upsertDocument(doc: GraphDocumentNode): Promise<void> {
    const now = new Date().toISOString();
    const session = this.driver.session();
    try {
      await session.run(
        `
        // 以文档业务 id 为唯一键：存在则命中，不存在则创建
        MERGE (d:KnowledgeDocument {id: $id})
        // 每次重建都刷新可变元数据；createdAt 仅首次写入
        SET d.title = $title, d.summary = $summary, d.categoryId = $categoryId,
            d.authorId = $authorId, d.status = $status, d.updatedAt = $now,
            d.createdAt = coalesce(d.createdAt, $now)
        `,
        {
          id: doc.id,
          title: doc.title,
          summary: doc.summary ?? '',
          categoryId: doc.categoryId ?? null,
          authorId: doc.authorId ?? null,
          status: doc.status,
          now,
        },
      );
    } finally {
      await session.close();
    }
  }

  /**
   * ③ chunk 节点 + 文档→块边：Document -[HAS_CHUNK]-> Chunk
   */
  async upsertChunk(chunk: GraphChunkNode): Promise<void> {
    const now = new Date().toISOString();
    const session = this.driver.session();
    try {
      await session.run(
        `
        // 以全局唯一 chunkId 幂等创建/更新块节点
        MERGE (c:DocumentChunk {chunkId: $chunkId})
        SET c.documentId = $documentId, c.content = $content, c.heading = $heading,
            c.chunkIndex = $chunkIndex, c.totalChunks = $totalChunks, c.updatedAt = $now
        // 携带 c 进入下一子句，避免丢失当前块上下文
        WITH c
        // 找到所属文档（① 已保证存在）
        MATCH (d:KnowledgeDocument {id: $documentId})
        // 文档→块 一对多边；边属性记序号便于按序遍历
        MERGE (d)-[r:HAS_CHUNK]->(c)
        SET r.chunkIndex = $chunkIndex
        `,
        {
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          content: chunk.content,
          heading: chunk.heading ?? null,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          now,
        },
      );
    } finally {
      await session.close();
    }
  }

  /**
   * 把抽取结果写入 Neo4j：
   * - KnowledgeEntity（按 name MERGE，跨文档可复用同名实体）
   * - DocumentChunk -[:MENTIONS]-> Entity
   * - Entity -[:RELATED_TO]-> Entity
   *
   * @returns 写入的实体数量（仅用于日志）
   */
  async writeExtraction(result: GraphExtraction): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;
    const session = this.driver.session();
    try {
      for (const entity of result.entities) {
        await session.run(
          `
          MERGE (e:KnowledgeEntity {name: $name})
          ON CREATE SET e.type = $type, e.description = $description,
                        e.aliases = $aliases, e.createdAt = $now, e.updatedAt = $now
          ON MATCH SET e.type = coalesce($type, e.type),
                       e.description = CASE WHEN $description <> '' THEN $description ELSE e.description END,
                       e.updatedAt = $now
          `,
          {
            name: entity.name,
            type: entity.type,
            description: entity.description ?? '',
            aliases: entity.aliases ?? [],
            now,
          },
        );
        count++;

        if (result.chunkId) {
          await session.run(
            `
            MATCH (c:DocumentChunk {chunkId: $chunkId})
            MATCH (e:KnowledgeEntity {name: $name})
            MERGE (c)-[:MENTIONS]->(e)
            `,
            { chunkId: result.chunkId, name: entity.name },
          );
        }
      }

      for (const rel of result.relations) {
        await session.run(
          `
          MATCH (a:KnowledgeEntity {name: $source})
          MATCH (b:KnowledgeEntity {name: $target})
          MERGE (a)-[r:RELATED_TO]->(b)
          ON CREATE SET r.relation = $relType, r.weight = $weight, r.createdAt = datetime()
          // 跨块取最大证据强度，避免后到的弱证据 / 默认值覆盖已有强证据
          ON MATCH SET r.weight = CASE
            WHEN r.weight IS NULL OR $weight > r.weight THEN $weight
            ELSE r.weight
          END
          // 按 chunkId 去重记录来源块：同块重复投递或重建不会重复计数；
          // 存量边没有 chunkIds，用 coalesce 从空列表起算
          SET r.chunkIds = CASE
            WHEN $chunkId IS NULL OR $chunkId IN coalesce(r.chunkIds, [])
              THEN coalesce(r.chunkIds, [])
            ELSE coalesce(r.chunkIds, []) + $chunkId
          END
          SET r.mentions = size(r.chunkIds)
          `,
          {
            source: rel.source,
            target: rel.target,
            relType: rel.relation,
            weight: rel.weight ?? 0.5,
            chunkId: result.chunkId ?? null,
          },
        );
      }

      return count;
    } finally {
      await session.close();
    }
  }

  /**
   * 删除文档及其 chunk；再清理「已无人提及」的孤儿实体，避免图膨胀。
   * 文档不存在时两条语句都是空操作，可重复执行（重复删除消息安全）。
   */
  async deleteByDocId(documentId: string): Promise<void> {
    const session = this.driver.session();
    try {
      // 先于删块执行：从 RELATED_TO 的 chunkIds 中摘掉本文档的块，证据清零的边一并删除。
      // 关系两端都是来源块提及的实体（normalize 已丢弃悬空关系），
      // 因此只需从本文档块提及的实体出发找边，不必全量扫描 RELATED_TO。
      // 没有 chunkIds 的存量边不会命中 any()，保持原状。
      await session.run(
        `
        MATCH (:KnowledgeDocument {id: $id})-[:HAS_CHUNK]->(c:DocumentChunk)
        WITH collect(c) AS chunks, collect(c.chunkId) AS removed
        UNWIND chunks AS c
        MATCH (c)-[:MENTIONS]->(:KnowledgeEntity)-[r:RELATED_TO]-()
        WHERE any(chunkId IN coalesce(r.chunkIds, []) WHERE chunkId IN removed)
        WITH DISTINCT r, removed
        SET r.chunkIds = [chunkId IN r.chunkIds WHERE NOT chunkId IN removed]
        SET r.mentions = size(r.chunkIds)
        WITH r WHERE r.mentions = 0
        DELETE r
        `,
        { id: documentId },
      );
      // 删除文档节点及其所有 chunk（DETACH 会一并拆掉相连关系边）
      await session.run(
        `
        // 定位待删文档
        MATCH (d:KnowledgeDocument {id: $id})
        // 可选匹配下属块：无 chunk 时仍可删文档
        OPTIONAL MATCH (d)-[:HAS_CHUNK]->(c:DocumentChunk)
        // DETACH DELETE：先删节点上的所有关系，再删节点本身
        // 会清掉 HAS_CHUNK 等与 c/d 相连的边
        DETACH DELETE c, d
        `,
        { id: documentId },
      );
      // 孤儿实体清理：没有任何 chunk MENTIONS 的实体视为无引用，整节点删除
      await session.run(
        `
        MATCH (e:KnowledgeEntity)
        // 入边 MENTIONS 为空 ⇒ 已无任何文档块引用该实体
        WHERE NOT (e)<-[:MENTIONS]-()
        // DETACH 同时清掉 RELATED_TO 等残留关系，避免悬空边
        DETACH DELETE e
        `,
      );
      this.logger.log(`KG 图谱已删除：documentId=${documentId}`);
    } finally {
      await session.close();
    }
  }

  /** 声明唯一约束（幂等），失败视为启动失败 */
  private async ensureConstraints(): Promise<void> {
    for (const statement of GRAPH_CONSTRAINT_STATEMENTS) {
      await this.driver.executeQuery(statement);
    }
    this.logger.log('Neo4j 唯一约束已就绪');
  }
}

export { GraphStoreService };
