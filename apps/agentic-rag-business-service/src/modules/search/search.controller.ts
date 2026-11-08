import { Body, Controller, Post } from '@nestjs/common';
import { SearchIndexService } from '../../infrastructure/elasticsearch/search-index.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionCode } from '../user/constants/permission.constants';
import type { AuthUser } from '../user/type/user.types';
import { accessFromUser } from '../document/helpers/document-access';
import { SearchDocumentsDto } from './dto/search.dto';

/** 文档关键词搜索（需登录 + search 权限码） */
@Controller('search')
class SearchController {
  /**
   * @description 注入文档搜索索引服务
   * @param searchIndex SearchIndexService，查询 ES kh_document
   */
  constructor(private readonly searchIndex: SearchIndexService) {}

  /**
   * @description POST /search：关键词检索已发布文档（ES kh_document）；ES 出错时返回空分页
   * @param dto SearchDocumentsDto，请求体：keyword 必填，page / pageSize / categoryId / authorId 可选
   * @param user AuthUser，当前登录用户，用于限制可见文档
   * @returns Promise<SearchDocumentsResult>，items（含高亮片段，不含正文）、total、page、pageSize
   */
  @Post()
  @RequirePermission(PermissionCode.search)
  search(@Body() dto: SearchDocumentsDto, @CurrentUser() user: AuthUser) {
    return this.searchIndex.searchDocuments({
      keyword: dto.keyword,
      page: dto.page,
      pageSize: dto.pageSize,
      categoryId: dto.categoryId,
      authorId: dto.authorId,
      scope: accessFromUser(user),
    });
  }
}

export { SearchController };
