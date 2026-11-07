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
class GraphQueryDto {
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
class GraphSearchDto {
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

/** GET /graph/overview 全景图查询参数 */
class GraphOverviewDto {
  /** 文档标题、摘要、标签或实体名称关键词 */
  @IsOptional()
  @IsString()
  keyword?: string;

  /** 实体类型过滤 */
  @IsOptional()
  @IsString()
  entityType?: string;

  /** 文档 updatedAt 下界，ISO 字符串 */
  @IsOptional()
  @IsString()
  from?: string;

  /** 文档 updatedAt 上界，ISO 字符串 */
  @IsOptional()
  @IsString()
  to?: string;

  /** 最多选取的文档数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(80)
  docLimit?: number;
}

export { GraphOverviewDto, GraphQueryDto, GraphSearchDto };
