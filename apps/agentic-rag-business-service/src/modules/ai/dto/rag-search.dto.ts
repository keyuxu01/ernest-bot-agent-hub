import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** RAG 混合检索请求（不生成回答） */
export class RagSearchDto {
  /** 检索问题 */
  @IsString()
  @IsNotEmpty()
  query: string;

  /** 精排后返回条数，默认 5 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number = 5;
}
