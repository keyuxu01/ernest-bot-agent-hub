import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** GET /ai/sessions 会话列表分页参数 */
class QuerySessionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

/** POST /ai/sessions 新建空会话请求 */
class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

/** PATCH /ai/sessions/:id 重命名会话请求 */
class UpdateSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title: string;
}

export { CreateSessionDto, QuerySessionDto, UpdateSessionDto };
