import {
  KG_DEFAULT_RELATION_WEIGHT,
  KG_ENTITY_TYPES,
  KG_FALLBACK_ENTITY_TYPE,
  KG_FALLBACK_RELATION_TYPE,
  KG_MAX_ENTITIES_PER_CHUNK,
  KG_MAX_RELATIONS_PER_CHUNK,
  KG_RELATION_TYPES,
} from '../constants/kg-extraction.constants';
import type {
  KgExtractionLlmOutput,
  KgExtractionResult,
} from '../type/kg-extraction.types';

const ENTITY_TYPE_SET = new Set<string>(KG_ENTITY_TYPES);
const RELATION_TYPE_SET = new Set<string>(KG_RELATION_TYPES);

/** 把 LLM 返回的实体类型规范到枚举；大小写不敏感，未知值兜底 CONCEPT */
function normalizeEntityType(raw: string | undefined | null): string {
  const upper = (raw ?? '').trim().toUpperCase();
  return ENTITY_TYPE_SET.has(upper) ? upper : KG_FALLBACK_ENTITY_TYPE;
}

/**
 * 把 LLM 返回的关系类型规范到枚举；未知值兜底 RELATED_TO。
 *
 * 可传多个候选（relation、type），取第一个「已知且不是兜底值」的具体类型。
 * 联调发现 qwen-plus 常返回 `relation: ""` 或 `relation: "RELATED_TO"`，
 * 真实语义却写在 `type` 里；源提交用 `relation ?? type`，空串不回退，语义全部丢失。
 */
function normalizeRelationType(
  ...candidates: Array<string | undefined | null>
): string {
  for (const raw of candidates) {
    const upper = (raw ?? '').trim().toUpperCase();
    if (RELATION_TYPE_SET.has(upper) && upper !== KG_FALLBACK_RELATION_TYPE) {
      return upper;
    }
  }
  return KG_FALLBACK_RELATION_TYPE;
}

/**
 * LLM 输出 → 可落图结果。
 *
 * 迁自源提交 ExtractionService.toExtractionResult，逻辑一致：
 * - 实体：先截断到上限，再去掉空名（同名不去重，Neo4j 侧 MERGE 幂等）
 * - 关系：source / target 必须都在本块实体内，否则丢弃，避免 MATCH 不到节点的悬空边
 * - 关系类型在 relation / type 两个字段中取具体类型（见 normalizeRelationType，
 *   这是联调后的修复，源提交为 `relation ?? type`）
 */
function toKgExtractionResult(
  parsed: KgExtractionLlmOutput,
): KgExtractionResult {
  const entityNames = new Set<string>();
  const entities: KgExtractionResult['entities'] = [];
  for (const e of (parsed.entities ?? []).slice(0, KG_MAX_ENTITIES_PER_CHUNK)) {
    const name = (e.name ?? '').trim();
    if (!name) continue;
    entityNames.add(name);
    entities.push({
      name,
      type: normalizeEntityType(e.type),
      description: (e.description ?? '').trim(),
      aliases: (e.aliases ?? []).map((a) => String(a).trim()).filter(Boolean),
    });
  }

  const relations: KgExtractionResult['relations'] = [];
  for (const r of (parsed.relations ?? []).slice(
    0,
    KG_MAX_RELATIONS_PER_CHUNK,
  )) {
    const source = (r.source ?? '').trim();
    const target = (r.target ?? '').trim();
    if (!entityNames.has(source) || !entityNames.has(target)) continue;
    relations.push({
      source,
      target,
      relation: normalizeRelationType(r.relation, r.type),
      weight:
        typeof r.weight === 'number' ? r.weight : KG_DEFAULT_RELATION_WEIGHT,
    });
  }

  return { entities, relations };
}

export { normalizeEntityType, normalizeRelationType, toKgExtractionResult };
