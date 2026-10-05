import { Controller, Get } from '@nestjs/common';
import type { RagBusinessGreetingResponse } from '@repo/contracts';
import { GreetingService } from './greeting.service';

@Controller()
export class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  @Get()
  getHello(): RagBusinessGreetingResponse {
    return this.greetingService.getHello();
  }
}
