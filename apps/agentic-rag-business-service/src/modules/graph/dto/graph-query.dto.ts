import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/** GET /graph/nodes、/graph/edges 查询参数 */
export class GraphQueryDto {
  /** 实体类型过滤（只对 nodes 生效） */
  @IsOptional()
  @IsString()
  type?: string;

  /** 最多返回条数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

/** GET /graph/search 查询参数 */
export class GraphSearchDto {
  /** 关键词，必填 */
  @IsString()
  @MinLength(1)
  keyword: string;

  /** 最多返回条数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
