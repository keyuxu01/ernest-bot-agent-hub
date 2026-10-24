import { describe, expect, it } from 'vitest';
import {
  KG_MAX_ENTITIES_PER_CHUNK,
  KG_MAX_RELATIONS_PER_CHUNK,
} from '../constants/kg-extraction.constants';
import {
  normalizeEntityType,
  normalizeRelationType,
  toKgExtractionResult,
} from './normalize-kg-extraction';

describe('normalizeEntityType / normalizeRelationType', () => {
  it('accepts known types case-insensitively', () => {
    expect(normalizeEntityType(' organization ')).toBe('ORGANIZATION');
    expect(normalizeRelationType('requires')).toBe('REQUIRES');
  });

  it('falls back for unknown or missing types', () => {
    expect(normalizeEntityType('部门')).toBe('CONCEPT');
    expect(normalizeEntityType(undefined)).toBe('CONCEPT');
    expect(normalizeRelationType('APPLIES_TO')).toBe('RELATED_TO');
    expect(normalizeRelationType(null)).toBe('RELATED_TO');
  });

  it('prefers a specific relation from `type` when `relation` is blank or fallback', () => {
    // 联调中 qwen-plus 的真实返回形态
    expect(normalizeRelationType('', 'RESPONSIBLE_FOR')).toBe(
      'RESPONSIBLE_FOR',
    );
    expect(normalizeRelationType('RELATED_TO', 'USES')).toBe('USES');
    expect(normalizeRelationType('REQUIRES', 'USES')).toBe('REQUIRES');
    expect(normalizeRelationType('', undefined)).toBe('RELATED_TO');
  });
});

describe('toKgExtractionResult', () => {
  it('trims names, drops blank entities and fills defaults (no dedupe, same as source)', () => {
    const result = toKgExtractionResult({
      entities: [
        { name: ' 财务部 ', type: 'organization', aliases: [' 财务 ', ''] },
        { name: '财务部', type: 'CONCEPT' },
        { name: '   ' },
      ],
      relations: [],
    });
    expect(result.entities).toEqual([
      {
        name: '财务部',
        type: 'ORGANIZATION',
        description: '',
        aliases: ['财务'],
      },
      { name: '财务部', type: 'CONCEPT', description: '', aliases: [] },
    ]);
  });

  it('drops dangling relations and reads relation type from `type` fallback', () => {
    const result = toKgExtractionResult({
      entities: [{ name: '财务部' }, { name: '差旅报销' }],
      relations: [
        {
          source: '财务部',
          target: '差旅报销',
          relation: '',
          type: 'responsible_for',
        },
        { source: '财务部', target: '不存在', relation: 'USES' },
      ],
    });
    expect(result.relations).toEqual([
      {
        source: '财务部',
        target: '差旅报销',
        relation: 'RESPONSIBLE_FOR',
        weight: 0.5,
      },
    ]);
  });

  it('caps entities and relations per chunk', () => {
    const names = Array.from({ length: 30 }, (_, i) => `实体${i}`);
    const result = toKgExtractionResult({
      entities: names.map((name) => ({ name })),
      relations: names.map((name) => ({
        source: names[0]!,
        target: name,
        relation: 'USES',
        weight: 0.9,
      })),
    });
    expect(result.entities).toHaveLength(KG_MAX_ENTITIES_PER_CHUNK);
    expect(result.relations.length).toBeLessThanOrEqual(
      KG_MAX_RELATIONS_PER_CHUNK,
    );
    // 超出实体上限的目标已被截掉，对应关系一并丢弃
    expect(
      result.relations.every((r) =>
        result.entities.some((e) => e.name === r.target),
      ),
    ).toBe(true);
  });
});
