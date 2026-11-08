import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** POST /ai/chat/stream 的 AI SDK useChat 请求体；协议附加字段显式放行 */
class ChatStreamDto {
  @IsArray()
  messages: Array<{
    role?: string;
    parts?: Array<{ type?: string; text?: string }>;
  }>;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @Allow()
  trigger?: unknown;

  @IsOptional()
  @Allow()
  messageId?: unknown;
}

export { ChatStreamDto };
