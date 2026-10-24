import type { z } from 'zod';
import type {
  GraphEntity,
  GraphRelation,
} from '../../../infrastructure/neo4j/type/graph-store.types';
import type { KgExtractionLlmOutputSchema } from '../schemas/kg-extraction.zod';

/** LLM 原始结构化输出（未规范化） */
type KgExtractionLlmOutput = z.output<typeof KgExtractionLlmOutputSchema>;

/** 规范化后的单块抽取结果：类型已归类、数量已截断、悬空关系已丢弃，可直接落图 */
type KgExtractionResult = {
  entities: GraphEntity[];
  relations: GraphRelation[];
};

export type { KgExtractionLlmOutput, KgExtractionResult };
