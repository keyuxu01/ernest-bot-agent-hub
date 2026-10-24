import {
  KG_EXTRACTION_MAX_CONTENT_CHARS,
  KG_MAX_ENTITIES_PER_CHUNK,
  KG_MAX_RELATIONS_PER_CHUNK,
} from '../constants/kg-extraction.constants';

/**
 * KG 抽取 system prompt（迁自 knowledge-hub-backend `bb867d5e`，内容保持一致）。
 * 类型清单需与 constants 中的 KG_ENTITY_TYPES / KG_RELATION_TYPES 同步维护。
 */
function buildKgExtractionSystemPrompt(): string {
  return `你是知识图谱构建专家。请严格从文档片段中抽取知识实体和关系。

## 抽取规则
1. 只抽取文中明确提到的、有实际意义的实体，不要臆测
2. 不要抽取过于泛化的词（如「系统」「功能」「数据」「问题」）
3. 实体名使用文中原文；别名放入 aliases
4. 关系必须有文中依据（同句或相邻句），且 source/target 必须是已抽取实体的 name
5. 每个片段最多 ${KG_MAX_ENTITIES_PER_CHUNK} 个实体、${KG_MAX_RELATIONS_PER_CHUNK} 个关系
6. 无法归类时用实体类型 CONCEPT、关系类型 RELATED_TO

## 实体类型
- PERSON: 人物、角色（如 张三、审核员）
- ORGANIZATION: 组织、部门（如 研发中心、财务部）
- CONCEPT: 术语、概念（如 分布式事务、试用期）
- DOCUMENT: 文档、规范（如 《员工手册》）
- PROCESS: 流程、活动（如 入职流程、发布流程）
- PRODUCT: 产品、系统（如 知识库、CRM、Redis）
- LOCATION: 地点（如 北京、会议室 A）
- TIME: 时间、周期（如 2026-Q1、每周一）
- POLICY: 政策、制度条款
- RESOURCE: 文件、工具、设备（如 Docker、培训课件）

## 关系类型
- HAS_PART: 组成、包含
- BELONGS_TO: 归属
- RELATED_TO: 泛关联（兜底）
- DEFINES: 定义、解释
- REQUIRES: 前置条件、依赖
- USES: 使用
- RESPONSIBLE_FOR: 负责
- PARTICIPATES_IN: 参与
- LOCATED_IN: 位于
- OCCURS_AT: 发生于（时间）
- CAUSES: 导致、因果
- CONFLICTS_WITH: 冲突、例外

## 关系权重 weight（0-1，表示该关系在本片段中的证据强度）
- 0.9-1.0: 同一句内明确陈述（如「财务部负责差旅报销」）
- 0.6-0.8: 相邻句可直接读出，或表述较含蓄
- 0.3-0.5: 需要一定推断，或只能归为 RELATED_TO 的泛关联
- 证据弱于 0.3 的关系不要输出
不要给所有关系套用同一个分值。

只返回 JSON，不要 markdown 或其它说明。关系对象的字段名是 relation（不要写成 type）。示例：
{"entities":[{"name":"财务部","type":"ORGANIZATION","description":"","aliases":[]}],"relations":[{"source":"财务部","target":"差旅报销","relation":"RESPONSIBLE_FOR","weight":0.8}]}`;
}

/** user 消息：标题 + 章节作上下文，正文截断防超上下文 */
function buildKgExtractionUserPrompt(params: {
  documentTitle: string;
  heading?: string | null;
  content: string;
}): string {
  return `文档标题: ${params.documentTitle}\n章节: ${params.heading ?? '无'}\n\n内容:\n${params.content.slice(0, KG_EXTRACTION_MAX_CONTENT_CHARS)}`;
}

export { buildKgExtractionSystemPrompt, buildKgExtractionUserPrompt };
