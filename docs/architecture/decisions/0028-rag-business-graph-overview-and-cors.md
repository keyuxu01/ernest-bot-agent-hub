# ADR-0028：RagBusiness 图谱全景接口、标签节点与浏览器跨域白名单

- 状态：Accepted
- 日期：2026-11-07
- 来源：迁入 knowledge-hub-backend 的 `a2f053514177549a3b0f7b963e453d42b609830d`（v12）。
- 相关：[ADR-0022](./0022-use-neo4j-for-knowledge-graph.md)、
  [ADR-0025](./0025-rag-business-permission-codes-and-teams.md)、
  [ADR-0026](./0026-rag-business-search-and-graph-read-apis.md)
- 部分替代：ADR-0026「图谱接口只要求登录」。

## 背景与决策

现有 `/graph/search|nodes|edges` 只能分别读取节点、关系或关键词命中，前端若要绘制包含文档、
实体和标签的全景图，需要自行拼装多次请求，且 Neo4j 文档节点尚未保存标签。
浏览器前端与业务服务分域部署，业务 API 也需要明确的 CORS 策略。

- **文档标签**：KG 重建时把 `PipelineDocument.tags` 写入 `KnowledgeDocument.tags`；继续沿用
  逗号分隔的现有文档字段，不新增 Neo4j 持久化标签节点。
- **`GET /graph/overview`**：按关键词、实体类型、文档更新时间和文档数上限筛选，返回：
  - 文档、实体和请求时从标签字符串生成的标签节点；
  - 文档到实体的「提及」、文档到标签的「标注」、当前画布实体之间的关联边；
  - 全库文档、实体、提及、关联计数，实体类型分布，热门实体和最近文档。
- **故障语义**：沿用图谱读取接口约定。Neo4j 查询失败记录 warn，并返回结构完整的空全景；
  图谱写入失败仍向上抛出。
- **授权**：`GraphController` 类统一要求 `search` 权限码，覆盖 overview、search、nodes、edges；
  `ROLE_ADMIN` 继续由现有权限守卫放行。
- **CORS**：启用 credentialed CORS，允许来源读取 `CORS_ORIGINS` 逗号分隔白名单，未配置时仅允许
  `http://localhost:3000`。生产部署必须显式配置实际 Web 域名。

与源提交的差异（项目约定与安全边界）：

- 源提交把全景查询放在 pipeline 的 `GraphBuildService`；本项目继续放在
  `src/infrastructure/neo4j/GraphStoreService`，Controller 只做输入适配。
- 源提交在 Neo4j driver 缺失时返回空值；本项目的 Neo4j 是启动强依赖，因此不保留不可达分支，
  只保留运行期查询失败降级。
- 源提交使用 `origin: true` 并允许 credentials，会反射任意来源；本项目改为明确来源白名单，
  与部署架构中的生产 CORS 边界一致。
- 独立入参、返回结构放入 infrastructure 的 `type/`，避免把可复用类型堆在 Service 内。

## 边界与后果

- 只有在本版本之后重新执行 KG 构建的文档才有 `tags` 属性；已有节点需要重新发布或重建才能出现标签。
- `from` / `to` 沿用源实现，以字符串与 Neo4j 中 ISO `updatedAt` 比较；调用方应传 ISO 时间字符串。
- 全景统计、热门实体和最近文档是全库数据，不受主画布过滤条件限制。
- 关键词同时命中文档属性和实体时按文档 ID 去重；实体补充查询可能使最终文档数超过单个
  `docLimit`，与源实现一致。
- 当前查询仍未按文档公开性、作者或团队过滤。拥有 `search` 权限的用户可以读取全部图谱数据。
- `CORS_ORIGINS` 是 HTTP API 进程配置，不影响 RabbitMQ consumer。

## 验证

- 业务服务 lint、类型检查、单元测试、构建与 e2e 测试通过。
- `GraphOverviewDto` 限制 `docLimit` 为 1-80，未知查询参数仍由全局 ValidationPipe 拒绝。
- Neo4j 文档 upsert 携带 tags；overview 查询返回完整结构，异常路径返回空结构。
- `/graph/*` 统一受 `search` 权限保护；CORS 只接受配置白名单来源。
