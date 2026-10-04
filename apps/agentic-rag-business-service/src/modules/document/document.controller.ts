import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentParseService } from './document-parse.service';
import { MAX_UPLOAD_FILE_BYTES } from './constants/document-upload.constants';
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { UploadParseDocumentDto } from './dto/upload-parse-document.dto';
import { DocumentFileTooLargeFilter } from './filters/document-file-too-large.filter';

/** 文档接口 */
@Controller('documents')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly documentParseService: DocumentParseService,
  ) {}

  /** 创建文档 */
  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.documentService.create(dto);
  }

  /**
   * 上传文件并解析为 Markdown 草稿（multipart，文件字段 `file`，其余为 `UploadParseDocumentDto` 文本字段）
   * - 同步等待解析完成后才响应
   * - Multer 内存存储；超过上限在读完前即被拒绝，由 `DocumentFileTooLargeFilter` 转为稳定错误码
   * - `defParamCharset: 'utf8'`：Multer 默认按 latin1 解码文件名，中文名会乱码
   * - `file` 的结构校验在 Service 入口完成，这里不假设类型
   */
  @Post('upload/parse')
  @UseFilters(DocumentFileTooLargeFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_FILE_BYTES, files: 1 },
      defParamCharset: 'utf8',
    }),
  )
  uploadAndParse(
    @UploadedFile() file: unknown,
    @Body() dto: UploadParseDocumentDto,
  ) {
    return this.documentParseService.uploadAndParse(file, dto);
  }

  /** 分页查询文档列表（仅元数据） */
  @Get()
  findAll(@Query() query: QueryDocumentDto) {
    return this.documentService.findAll(query);
  }

  /** 查询文档详情（含正文） */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentService.findOne(id);
  }

  /** 更新文档 */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentService.update(id, dto);
  }

  /** 软删除文档 */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentService.remove(id);
  }
}
