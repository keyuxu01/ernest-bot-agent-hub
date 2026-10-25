import { Controller, Get } from '@nestjs/common';
import type { RagBusinessGreetingResponse } from '@repo/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { GreetingService } from './greeting.service';

@Public()
@Controller()
export class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  @Get()
  getHello(): RagBusinessGreetingResponse {
    return this.greetingService.getHello();
  }
}
