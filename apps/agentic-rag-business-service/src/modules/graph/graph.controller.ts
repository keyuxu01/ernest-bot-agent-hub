import { Controller, Get, Query } from '@nestjs/common';
import { GraphStoreService } from '../../infrastructure/neo4j/graph-store.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionCode } from '../user/constants/permission.constants';
import {
  GraphOverviewDto,
  GraphQueryDto,
  GraphSearchDto,
} from './dto/graph-query.dto';

/** 知识图谱只读查询（需 search 权限）；Neo4j 出错时返回空结果 */
@Controller('graph')
@RequirePermission(PermissionCode.search)
class GraphController {
  /**
   * @description 注入图谱存储服务
   * @param graph GraphStoreService，查询 Neo4j
   */
  constructor(private readonly graph: GraphStoreService) {}

  /**
   * @description GET /graph/overview：查询文档、实体、标签及统计组成的全景图
   * @param query GraphOverviewDto，关键词、实体类型、更新时间范围与文档上限
   * @returns Promise<GraphOverviewResponse>，力导向图所需节点、边和统计信息
   */
  @Get('overview')
  overview(@Query() query: GraphOverviewDto) {
    return this.graph.getOverview({
      keyword: query.keyword,
      entityType: query.entityType,
      from: query.from,
      to: query.to,
      docLimit: query.docLimit,
    });
  }

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
