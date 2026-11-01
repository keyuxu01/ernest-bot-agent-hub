import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** 全文搜索请求 */
export class SearchDocumentsDto {
  /** 关键词，必填 */
  @IsString()
  @IsNotEmpty()
  keyword: string;

  /** 页码，从 1 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** 每页条数，最大 50 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 10;

  /** 按分类过滤 */
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** 按作者过滤 */
  @IsOptional()
  @IsString()
  authorId?: string;
}
