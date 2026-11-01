/** 文档级关键词索引，与 kh_chunk 向量块索引分开维护。 */
const SEARCH_DOCUMENT_INDEX = 'kh_document';

/**
 * 中文分词字段：写入细切（ik_max_word，尽量多切出词，提高召回），检索粗切（ik_smart，减少噪声）
 * 依赖 ES 安装 analysis-ik 插件（infra/elasticsearch/Dockerfile 构建镜像时安装）
 */
const IK_TEXT_FIELD = {
  type: 'text',
  analyzer: 'ik_max_word',
  search_analyzer: 'ik_smart',
} as const;

export { IK_TEXT_FIELD, SEARCH_DOCUMENT_INDEX };
