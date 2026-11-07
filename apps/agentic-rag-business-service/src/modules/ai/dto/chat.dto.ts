import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** RAG 对话请求 */
export class ChatDto {
  /** 用户问题 */
  @IsString()
  @IsNotEmpty()
  content: string;

  /** 召回块数，默认 5 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number = 5;
}
