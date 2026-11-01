import {
  Controller,
  Get,
  Post,
  Put,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionCode } from '../user/constants/permission.constants';
import type { AuthUser } from '../user/type/user.types';

/** 文档接口（需登录 + 权限码；authorId / createBy / updateBy 都取当前登录用户） */
@Controller('documents')
export class DocumentController {
  /**
   * @description 注入文档业务服务与上传解析服务
   * @param documentService DocumentService，文档增删改查与状态流转
   * @param documentParseService DocumentParseService，上传文件解析为 Markdown 草稿
   */
  constructor(
    private readonly documentService: DocumentService,
    private readonly documentParseService: DocumentParseService,
  ) {}

  /**
   * @description POST /documents：创建文档（document:create）；作者 / 创建人取登录用户
   * @param dto CreateDocumentDto，请求体；请求体带 authorId / createBy 会被拒（400）
   * @param user AuthUser，当前登录用户
   * @returns Promise<DocumentEntity & { content: string }>，新建的文档
   */
  @Post()
  @RequirePermission(PermissionCode.documentCreate)
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documentService.create(dto, user);
  }

  /**
   * 上传文件并解析为 Markdown 草稿（multipart，文件字段 `file`，其余为 `UploadParseDocumentDto` 文本字段）
   * - 同步等待解析完成后才响应
   * - Multer 内存存储；超过上限在读完前即被拒绝，由 `DocumentFileTooLargeFilter` 转为稳定错误码
   * - `defParamCharset: 'utf8'`：Multer 默认按 latin1 解码文件名，中文名会乱码
   * - `file` 的结构校验在 Service 入口完成，这里不假设类型
   * @description POST /documents/upload/parse：上传文件解析成 Markdown 草稿（document:create）
   * @param file unknown，multipart 的 `file` 字段原始值
   * @param dto UploadParseDocumentDto，multipart 文本字段：标题、分类、团队、标签、备注（不含作者 / 创建人）
   * @param user AuthUser，当前登录用户，作为作者 / 创建人
   * @returns Promise<UploadParseDocumentResult>，新草稿的 ID、标题、解析器、字数、图片数与原文件信息
   */
  @Post('upload/parse')
  @RequirePermission(PermissionCode.documentCreate)
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
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentParseService.uploadAndParse(file, dto, user);
  }

  /**
   * @description GET /documents：分页查询文档列表，仅元数据（document:list）
   * @param query QueryDocumentDto，分页与筛选条件
   * @returns Promise<{ items: DocumentEntity[]; total: number; ... }>，分页结果
   */
  @Get()
  @RequirePermission(PermissionCode.documentList)
  findAll(@Query() query: QueryDocumentDto) {
    return this.documentService.findAll(query);
  }

  /**
   * @description PUT /documents/:id/publish：发布文档（document:edit）；开启审核时进入待审，免审则直接发布并投递 RAG / Search / KG
   * @param id string，路径参数，文档 ID
   * @param user AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<DocumentEntity & { content: string }>，发布后（或待审）的文档
   */
  @Put(':id/publish')
  @RequirePermission(PermissionCode.documentEdit)
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentService.publish(id, user);
  }

  /**
   * @description PUT /documents/:id/archive：归档 Published → Archived，并清 RAG / Search / KG 索引（document:edit）
   * @param id string，路径参数，文档 ID
   * @param user AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<DocumentEntity>，归档后的文档
   */
  @Put(':id/archive')
  @RequirePermission(PermissionCode.documentEdit)
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentService.archive(id, user);
  }

  /**
   * @description PUT /documents/:id/save-draft：存为草稿 Published → Draft，清索引后可改内容再提交发布（document:edit）
   * @param id string，路径参数，文档 ID
   * @param user AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<DocumentEntity>，改为草稿后的文档
   */
  @Put(':id/save-draft')
  @RequirePermission(PermissionCode.documentEdit)
  saveAsDraft(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentService.saveAsDraft(id, user);
  }

  /**
   * @description GET /documents/:id：文档详情，含正文（document:list）
   * @param id string，路径参数，文档 ID
   * @returns Promise<DocumentEntity & { content: string }>，文档元数据加正文；不存在返回 404
   */
  @Get(':id')
  @RequirePermission(PermissionCode.documentList)
  findOne(@Param('id') id: string) {
    return this.documentService.findOne(id);
  }

  /**
   * @description PATCH /documents/:id：更新文档（document:edit）；更新人取登录用户
   * @param id string，路径参数，文档 ID
   * @param dto UpdateDocumentDto，请求体，要修改的字段；带 authorId / updateBy 会被拒（400）
   * @param user AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<DocumentEntity & { content: string }>，更新后的文档
   */
  @Patch(':id')
  @RequirePermission(PermissionCode.documentEdit)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentService.update(id, dto, user);
  }

  /**
   * @description DELETE /documents/:id：软删除文档并清索引（document:delete）
   * @param id string，路径参数，文档 ID
   * @param user AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<{ id: string; deleted: true }>，被删文档 ID
   */
  @Delete(':id')
  @RequirePermission(PermissionCode.documentDelete)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentService.remove(id, user);
  }
}
