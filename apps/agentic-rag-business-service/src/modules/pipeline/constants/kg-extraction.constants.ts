/**
 * KG 实体关系抽取常量
 *
 * 迁自 knowledge-hub-backend `bb867d5e` 的 kg-extraction.schema.ts。
 * 源项目的 KG_MAX_ENTITIES / KG_MAX_RELATIONS 环境变量在这里收敛为常量：
 * 它们是防止图爆炸的产品约束，不是部署差异。
 */

/** 核心 + 扩展实体类型；LLM 返回值不在其中时归为 CONCEPT */
const KG_ENTITY_TYPES = [
  'PERSON',
  'ORGANIZATION',
  'CONCEPT',
  'DOCUMENT',
  'PROCESS',
  'PRODUCT',
  'LOCATION',
  'TIME',
  'POLICY',
  'RESOURCE',
] as const;

/** 实体间语义关系（写到 RELATED_TO 边的 relation 属性）；未知值归为 RELATED_TO */
const KG_RELATION_TYPES = [
  'HAS_PART',
  'BELONGS_TO',
  'RELATED_TO',
  'DEFINES',
  'REQUIRES',
  'USES',
  'RESPONSIBLE_FOR',
  'PARTICIPATES_IN',
  'LOCATED_IN',
  'OCCURS_AT',
  'CAUSES',
  'CONFLICTS_WITH',
] as const;

const KG_FALLBACK_ENTITY_TYPE = 'CONCEPT';
const KG_FALLBACK_RELATION_TYPE = 'RELATED_TO';

/** 单块最多实体 / 关系数，防止图爆炸 */
const KG_MAX_ENTITIES_PER_CHUNK = 12;
const KG_MAX_RELATIONS_PER_CHUNK = 15;

/** 送入 LLM 的单块正文上限（字符），防止超出上下文 */
const KG_EXTRACTION_MAX_CONTENT_CHARS = 4000;

/** 模型未给置信度时的默认权重 */
const KG_DEFAULT_RELATION_WEIGHT = 0.5;

/** withStructuredOutput 的函数名，会出现在模型请求里 */
const KG_EXTRACTION_OUTPUT_NAME = 'extract_knowledge_graph';

export {
  KG_DEFAULT_RELATION_WEIGHT,
  KG_ENTITY_TYPES,
  KG_EXTRACTION_MAX_CONTENT_CHARS,
  KG_EXTRACTION_OUTPUT_NAME,
  KG_FALLBACK_ENTITY_TYPE,
  KG_FALLBACK_RELATION_TYPE,
  KG_MAX_ENTITIES_PER_CHUNK,
  KG_MAX_RELATIONS_PER_CHUNK,
  KG_RELATION_TYPES,
};
