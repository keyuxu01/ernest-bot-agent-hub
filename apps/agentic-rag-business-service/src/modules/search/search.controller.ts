import { Body, Controller, Post } from '@nestjs/common';
import { SearchIndexService } from '../../infrastructure/elasticsearch/search-index.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionCode } from '../user/constants/permission.constants';
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
   * @returns Promise<SearchDocumentsResult>，items（含高亮片段，不含正文）、total、page、pageSize
   */
  @Post()
  @RequirePermission(PermissionCode.search)
  search(@Body() dto: SearchDocumentsDto) {
    return this.searchIndex.searchDocuments({
      keyword: dto.keyword,
      page: dto.page,
      pageSize: dto.pageSize,
      categoryId: dto.categoryId,
      authorId: dto.authorId,
    });
  }
}

export { SearchController };
