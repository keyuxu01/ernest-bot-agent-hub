import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
 * 未鉴权：审核人身份由请求体传入，接入用户模块前任何调用方都能通过 / 驳回。
 */
@Controller('documents')
class DocumentReviewController {
  constructor(private readonly reviewService: DocumentReviewService) {}

  /** 审核任务列表（默认待办） */
  @Get('reviews/tasks')
  listTasks(@Query() query: QueryReviewTasksDto) {
    return this.reviewService.listTasks(query);
  }

  /** 待审核数量（导航角标） */
  @Get('reviews/tasks/pending-count')
  countPending() {
    return this.reviewService.countPending();
  }

  /** 审核通过 → 文档 Published 并建索引 */
  @Post('reviews/tasks/:taskId/approve')
  approve(@Param('taskId') taskId: string, @Body() dto: ApproveReviewDto) {
    return this.reviewService.approve(taskId, dto);
  }

  /** 审核驳回 → 文档回 Draft，作者修改后可再次提交 */
  @Post('reviews/tasks/:taskId/reject')
  reject(@Param('taskId') taskId: string, @Body() dto: RejectReviewDto) {
    return this.reviewService.reject(taskId, dto);
  }

  /** 单独提交审核（开启审核时 publish 内部也走这里） */
  @Post(':id/reviews/submit')
  submit(@Param('id') id: string) {
    return this.reviewService.submit(id);
  }

  /** 当前待审记录；没有则返回空 */
  @Get(':id/reviews/current')
  getCurrent(@Param('id') id: string) {
    return this.reviewService.getCurrent(id);
  }

  /** 全部审核历史，按提交时间倒序 */
  @Get(':id/reviews/history')
  getHistory(@Param('id') id: string) {
    return this.reviewService.getHistory(id);
  }
}

export { DocumentReviewController };
