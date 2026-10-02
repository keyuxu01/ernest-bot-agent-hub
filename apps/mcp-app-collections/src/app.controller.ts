import { Controller, Get } from '@nestjs/common';
import type { GreetingResponse } from '@repo/contracts';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): GreetingResponse {
    return this.appService.getHello();
  }
}
