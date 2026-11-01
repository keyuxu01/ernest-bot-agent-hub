import { Controller, Get, Query } from '@nestjs/common';
import { GraphStoreService } from '../../infrastructure/neo4j/graph-store.service';
import { GraphQueryDto, GraphSearchDto } from './dto/graph-query.dto';

/** 知识图谱只读查询（需登录）；Neo4j 出错时返回空数组 */
@Controller('graph')
class GraphController {
  /**
   * @description 注入图谱存储服务
   * @param graph GraphStoreService，查询 Neo4j
   */
  constructor(private readonly graph: GraphStoreService) {}

  /**
   * @description GET /graph/search：按关键词搜实体 / 文档 / 块节点
   * @param query GraphSearchDto，查询参数 keyword 必填，limit 默认 50
   * @returns Promise<GraphSearchHitVO[]>，命中节点
   */
  @Get('search')
  search(@Query() query: GraphSearchDto) {
    return this.graph.searchGraph(query.keyword, query.limit ?? 50);
  }

  /**
   * @description GET /graph/nodes：知识实体节点
   * @param query GraphQueryDto，type 可选过滤实体类型，limit 默认 200
   * @returns Promise<GraphNodeVO[]>，实体节点
   */
  @Get('nodes')
  listNodes(@Query() query: GraphQueryDto) {
    return this.graph.listNodes(query.type, query.limit ?? 200);
  }

  /**
   * @description GET /graph/edges：实体间 RELATED_TO 边
   * @param query GraphQueryDto，limit 默认 500
   * @returns Promise<GraphEdgeVO[]>，关系边
   */
  @Get('edges')
  listEdges(@Query() query: GraphQueryDto) {
    return this.graph.listEdges(query.limit ?? 500);
  }
}

export { GraphController };
