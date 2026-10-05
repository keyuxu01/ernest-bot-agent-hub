import { Controller, Get } from '@nestjs/common';
import type { McpHelloResponse } from '@repo/contracts';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): McpHelloResponse {
    return this.appService.getHello();
  }
}
