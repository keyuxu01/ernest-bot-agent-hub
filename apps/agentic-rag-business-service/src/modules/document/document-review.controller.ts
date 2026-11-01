import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PermissionCode } from '../user/constants/permission.constants';
import { RoleCode } from '../user/constants/user.constants';
import type { AuthUser } from '../user/type/user.types';
import { DocumentReviewService } from './document-review.service';
import {
  ApproveReviewDto,
  QueryReviewTasksDto,
  RejectReviewDto,
} from './dto/document-review.dto';

/**
 * 文档发布审核接口
 *
 * 与 DocumentController 共用 `documents` 前缀；静态段 `reviews/...` 与 `:id` 的段数不同，不会互相吞路由。
 * 全部需登录并校验权限码；审核工作台（列表 / 计数 / 通过 / 驳回）另需 ROLE_REVIEWER 或 ROLE_ADMIN，
 * 审核人身份取自当前登录用户。
 */
@Controller('documents')
class DocumentReviewController {
  /**
   * @description 注入审核业务服务
   * @param reviewService DocumentReviewService，提审、审核、待办与历史
   */
  constructor(private readonly reviewService: DocumentReviewService) {}

  /**
   * @description GET /documents/reviews/tasks：审核任务列表，默认待办（审核员 / 管理员 + document:review）
   * @param query QueryReviewTasksDto，分页与结果筛选
   * @returns Promise<{ items; total; page; pageSize }>，审核任务分页结果
   */
  @Get('reviews/tasks')
  @Roles(RoleCode.REVIEWER, RoleCode.ADMIN)
  @RequirePermission(PermissionCode.documentReview)
  listTasks(@Query() query: QueryReviewTasksDto) {
    return this.reviewService.listTasks(query);
  }

  /**
   * @description GET /documents/reviews/tasks/pending-count：待审核数量，用于导航角标（审核员 / 管理员 + document:review）
   * @returns Promise<number>，待审核任务数
   */
  @Get('reviews/tasks/pending-count')
  @Roles(RoleCode.REVIEWER, RoleCode.ADMIN)
  @RequirePermission(PermissionCode.documentReview)
  countPending() {
    return this.reviewService.countPending();
  }

  /**
   * @description POST /documents/reviews/tasks/:taskId/approve：审核通过 → 文档 Published 并建索引（审核员 / 管理员 + document:review）
   * @param taskId string，路径参数，审核任务 ID
   * @param dto ApproveReviewDto，请求体，审核意见可选
   * @param reviewer AuthUser，当前登录用户，作为审核人
   * @returns Promise<DocumentEntity>，审核通过后的文档
   */
  @Post('reviews/tasks/:taskId/approve')
  @Roles(RoleCode.REVIEWER, RoleCode.ADMIN)
  @RequirePermission(PermissionCode.documentReview)
  approve(
    @Param('taskId') taskId: string,
    @Body() dto: ApproveReviewDto,
    @CurrentUser() reviewer: AuthUser,
  ) {
    return this.reviewService.approve(taskId, dto, reviewer);
  }

  /**
   * @description POST /documents/reviews/tasks/:taskId/reject：审核驳回 → 文档回 Draft，作者修改后可再次提交（审核员 / 管理员 + document:review）
   * @param taskId string，路径参数，审核任务 ID
   * @param dto RejectReviewDto，请求体，驳回意见必填
   * @param reviewer AuthUser，当前登录用户，作为审核人
   * @returns Promise<DocumentEntity>，驳回后的文档
   */
  @Post('reviews/tasks/:taskId/reject')
  @Roles(RoleCode.REVIEWER, RoleCode.ADMIN)
  @RequirePermission(PermissionCode.documentReview)
  reject(
    @Param('taskId') taskId: string,
    @Body() dto: RejectReviewDto,
    @CurrentUser() reviewer: AuthUser,
  ) {
    return this.reviewService.reject(taskId, dto, reviewer);
  }

  /**
   * @description POST /documents/:id/reviews/submit：提交审核，开启审核时 publish 内部也走这里（document:edit）
   * @param id string，路径参数，文档 ID
   * @param user AuthUser，当前登录用户，写入 updateBy
   * @returns Promise<DocumentEntity>，进入待审后的文档
   */
  @Post(':id/reviews/submit')
  @RequirePermission(PermissionCode.documentEdit)
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reviewService.submit(id, user);
  }

  /**
   * @description GET /documents/:id/reviews/current：当前待审记录（document:list 或 document:review）
   * @param id string，路径参数，文档 ID
   * @returns Promise<DocumentReviewEntity | null>，当前待审记录；没有则返回空
   */
  @Get(':id/reviews/current')
  @RequirePermission(PermissionCode.documentList, PermissionCode.documentReview)
  getCurrent(@Param('id') id: string) {
    return this.reviewService.getCurrent(id);
  }

  /**
   * @description GET /documents/:id/reviews/history：全部审核历史，按提交时间倒序（document:list 或 document:review）
   * @param id string，路径参数，文档 ID
   * @returns Promise<DocumentReviewEntity[]>，审核记录列表
   */
  @Get(':id/reviews/history')
  @RequirePermission(PermissionCode.documentList, PermissionCode.documentReview)
  getHistory(@Param('id') id: string) {
    return this.reviewService.getHistory(id);
  }
}

export { DocumentReviewController };
