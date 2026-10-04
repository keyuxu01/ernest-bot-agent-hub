/**
 * RabbitMQ 拓扑常量
 *
 * 交换机：rag.reindex
 * 队列名带 `kh.` 前缀，避免和本机同时跑的其他项目冲突。
 */

/** RAG 重建索引交换机（topic） */
const RAG_REINDEX_EXCHANGE = 'rag.reindex.exchange';

/** 本服务消费的队列 */
const RAG_REINDEX_QUEUE = 'kh.rag.reindex.queue';

/** 路由键：按文档 ID 重建 */
const RAG_RK_BY_IDS = 'rag.reindex.by_ids';

/** 连接超时（毫秒）；只在本基础设施内使用 */
const RABBITMQ_CONNECT_TIMEOUT_MS = 15_000;

export {
  RAG_REINDEX_EXCHANGE,
  RAG_REINDEX_QUEUE,
  RAG_RK_BY_IDS,
  RABBITMQ_CONNECT_TIMEOUT_MS,
};
