/**
 * RabbitMQ 拓扑常量
 *
 * 交换机：rag.reindex / search.index
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

/** RAG 删除与独立 Search 队列：避免两类消费者竞争同一条消息。 */
const RAG_RK_DELETE = 'rag.reindex.delete';
const SEARCH_INDEX_EXCHANGE = 'search.index.exchange';
const SEARCH_INDEX_QUEUE = 'kh.search.index.queue';
const SEARCH_RK_INDEX = 'search.index.document';
const SEARCH_RK_DELETE = 'search.index.delete';

export {
  RAG_RK_DELETE,
  SEARCH_INDEX_EXCHANGE,
  SEARCH_INDEX_QUEUE,
  SEARCH_RK_INDEX,
  SEARCH_RK_DELETE,
  RAG_REINDEX_EXCHANGE,
  RAG_REINDEX_QUEUE,
  RAG_RK_BY_IDS,
  RABBITMQ_CONNECT_TIMEOUT_MS,
};
