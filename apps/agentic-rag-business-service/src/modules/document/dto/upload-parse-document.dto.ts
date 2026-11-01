import { IsOptional, IsString } from 'class-validator';

/** 上传解析的 multipart 文本字段（文件在 `file` 字段，不在此 DTO；作者从 JWT 取，不在表单传） */
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

  /** 标签（逗号分隔） */
  @IsOptional()
  @IsString()
  tags?: string;

  /** 备注 */
  @IsOptional()
  @IsString()
  remark?: string;
}

export { UploadParseDocumentDto };
