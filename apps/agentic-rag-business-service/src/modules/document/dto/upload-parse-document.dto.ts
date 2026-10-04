import { IsOptional, IsString } from 'class-validator';

/** 上传解析的 multipart 文本字段（文件在 `file` 字段，不在此 DTO） */
class UploadParseDocumentDto {
  /** 标题；未传则取文件名（去扩展名） */
  @IsOptional()
  @IsString()
  title?: string;

  /** 分类 ID */
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** 团队 ID */
  @IsOptional()
  @IsString()
  teamId?: string;

  /** 作者 ID */
  @IsOptional()
  @IsString()
  authorId?: string;

  /** 标签（逗号分隔） */
  @IsOptional()
  @IsString()
  tags?: string;

  /** 备注 */
  @IsOptional()
  @IsString()
  remark?: string;

  /** 创建人 ID */
  @IsOptional()
  @IsString()
  createBy?: string;
}

export { UploadParseDocumentDto };
