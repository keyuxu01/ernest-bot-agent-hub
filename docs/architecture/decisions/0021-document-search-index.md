# ADR-0021：文档级 Search 索引与 RAG 向量块分离

- 状态：Accepted
- 日期：2026-10-12
- 来源：迁入 knowledge-hub-backend 的 `3199525bd11e7ea78de1c20217bb0b2ebab44420`。

## 背景与决策

文档发布已有 RAG 分块向量管线，新增关键词索引需要保留文档级元数据。
采用独立 `search.index.exchange` / `kh.search.index.queue`，INDEX 消息携带发布时快照，
DELETE 仅携带文档 ID。ES `kh_document` 的 `_id` 使用文档 ID；`kh_chunk` 保持块级索引。
相比消费者再次读库，快照固定发布时内容且减少读取；代价是 broker 包含摘要及正文前缀。
正文最多携带 1000 个 UTF-16 码元，不能宣称可检索完整正文。

快照构建放在 document feature，消息边界使用 `@repo/contracts` 的版本化 Zod 契约；
RabbitMQ 基础设施不依赖业务 Entity，ES 客户端放在 infrastructure/elasticsearch。
RAG v1 类型增加 DELETE_BY_DOC_IDS，部署时应先更新消费者再启用新生产者。

沿用当前项目 ES 强依赖启动策略，不迁入源提交中「ES 不可用则 return」的降级分支。
正常返回会导致 MQ ack，不能把未执行写入当作成功。删除只忽略明确的 404；其他错误向上传播。

## 边界与后果

发布和软删后并行投递两条独立命令，没有跨库/MQ 事务，失败不回滚文档状态。
当前没有 outbox、有限重试、DLQ、补偿扫描或乱序版本控制，失败消息可能丢失；
旧 INDEX 晚于 DELETE 到达也可能恢复旧索引，不能作为生产可靠投递保证。
这些是保留源行为的增量迁移限制，生产可靠性需单独完成后才能宣称达标。
本次只接入 publish/remove，通用 update 的归档或内容编辑不自动同步索引，亦不新增搜索 API。

回滚应用时需停投新消息并排空新增队列；旧消费者不识别 RAG 删除消息。
新增 ES 索引可保留，删除它需单独授权，不影响 PG/Mongo 原文。

## 验证

契约测试覆盖 INDEX/DELETE、必填快照、ID 一致性、长度与版本；业务测试覆盖发布快照截断、
软删投递失败不回滚、按 ID 清理向量；ES mock 测试覆盖初始化失败、写入失败和删除 404。
以上不是实际 RabbitMQ/ES 联调验收。
