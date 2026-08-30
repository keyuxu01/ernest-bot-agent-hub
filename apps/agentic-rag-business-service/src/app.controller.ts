import { Controller, Get } from '@nestjs/common';
import type { GreetingResponse } from '@repo/types';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): GreetingResponse {
    return this.appService.getHello();
  }
}
