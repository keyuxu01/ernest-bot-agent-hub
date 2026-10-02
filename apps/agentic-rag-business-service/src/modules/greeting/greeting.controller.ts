import { Controller, Get } from '@nestjs/common';
import type { GreetingResponse } from '@repo/contracts';
import { GreetingService } from './greeting.service';

@Controller()
export class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  @Get()
  getHello(): GreetingResponse {
    return this.greetingService.getHello();
  }
}
