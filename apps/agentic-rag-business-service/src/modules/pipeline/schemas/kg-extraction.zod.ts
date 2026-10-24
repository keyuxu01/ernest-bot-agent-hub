import { z } from 'zod';

/**
 * LLM 结构化输出 schema（第三方响应边界）
 *
 * 迁自 knowledge-hub-backend `bb867d5e` kg-extraction.schema.ts。
 * type / relation 刻意用 string 而非 enum：模型常返回中文类型或自造类型
 * （如 APPLIES_TO），enum 校验失败会丢掉整块抽取；归类交给 normalize helper。
 * describe 文案会作为 JSON Schema 描述发给模型。
 */

/** 实体 */
const KgExtractedEntitySchema = z.object({
  name: z.string().describe('文中原文实体名'),
  type: z.string().describe('实体类型').optional(),
  description: z.string().describe('简短描述，可空').optional(),
  aliases: z.array(z.string()).describe('别名').optional(),
});

/** 关系 */
const KgExtractedRelationSchema = z.object({
  source: z.string().describe('起点实体 name，必须是已抽取实体'),
  target: z.string().describe('终点实体 name，必须是已抽取实体'),
  // 必填：联调发现 optional 时 qwen-plus 在长片段里会整列省略 relation，关系语义全部退化为兜底值。
  // 必填后 JSON Schema 的 required 会约束模型输出该字段。
  relation: z
    .string()
    .describe(
      '关系类型，取值 HAS_PART/BELONGS_TO/RELATED_TO/DEFINES/REQUIRES/USES/RESPONSIBLE_FOR/PARTICIPATES_IN/LOCATED_IN/OCCURS_AT/CAUSES/CONFLICTS_WITH',
    ),
  // 兼容：模型误把关系类型写成 type 时读取
  type: z
    .string()
    .describe('兼容：模型误把关系类型写成 type 时读取')
    .optional(),
  // 打分标准与 system prompt 的「关系权重」一节保持一致
  weight: z
    .number()
    .min(0)
    .max(1)
    .describe(
      '证据强度 0-1：同句明确陈述 0.9-1.0，相邻句可读出 0.6-0.8，需推断或泛关联 0.3-0.5',
    )
    .optional(),
});

/** 单个 chunk 的抽取结果 */
const KgExtractionLlmOutputSchema = z
  .object({
    entities: z.array(KgExtractedEntitySchema).describe('实体列表'),
    relations: z.array(KgExtractedRelationSchema).describe('关系列表'),
  })
  .describe('从文档片段抽取的知识实体与关系');

export { KgExtractionLlmOutputSchema };
