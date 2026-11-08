import { Controller, Get, Query } from '@nestjs/common';
import { GraphStoreService } from '../../infrastructure/neo4j/graph-store.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionCode } from '../user/constants/permission.constants';
import type { AuthUser } from '../user/type/user.types';
import { accessFromUser } from '../document/helpers/document-access';
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
   * @param user AuthUser，当前登录用户，用于限制图谱文档范围
   * @returns Promise<GraphOverviewResponse>，力导向图所需节点、边和统计信息
   */
  @Get('overview')
  overview(@Query() query: GraphOverviewDto, @CurrentUser() user: AuthUser) {
    return this.graph.getOverview({
      keyword: query.keyword,
      entityType: query.entityType,
      from: query.from,
      to: query.to,
      docLimit: query.docLimit,
      scope: accessFromUser(user),
    });
  }

  /**
   * @description GET /graph/search：按关键词搜实体 / 文档 / 块节点
   * @param query GraphSearchDto，查询参数 keyword 必填，limit 默认 50
   * @param user AuthUser，当前登录用户，用于限制图谱文档范围
   * @returns Promise<GraphSearchHitVO[]>，命中节点
   */
  @Get('search')
  search(@Query() query: GraphSearchDto, @CurrentUser() user: AuthUser) {
    return this.graph.searchGraph(
      query.keyword,
      query.limit ?? 50,
      accessFromUser(user),
    );
  }

  /**
   * @description GET /graph/nodes：知识实体节点
   * @param query GraphQueryDto，type 可选过滤实体类型，limit 默认 200
   * @param user AuthUser，当前登录用户，用于限制图谱文档范围
   * @returns Promise<GraphNodeVO[]>，实体节点
   */
  @Get('nodes')
  listNodes(@Query() query: GraphQueryDto, @CurrentUser() user: AuthUser) {
    return this.graph.listNodes(
      query.type,
      query.limit ?? 200,
      accessFromUser(user),
    );
  }

  /**
   * @description GET /graph/edges：实体间 RELATED_TO 边
   * @param query GraphQueryDto，limit 默认 500
   * @param user AuthUser，当前登录用户，用于限制图谱文档范围
   * @returns Promise<GraphEdgeVO[]>，关系边
   */
  @Get('edges')
  listEdges(@Query() query: GraphQueryDto, @CurrentUser() user: AuthUser) {
    return this.graph.listEdges(query.limit ?? 500, accessFromUser(user));
  }
}

export { GraphController };
