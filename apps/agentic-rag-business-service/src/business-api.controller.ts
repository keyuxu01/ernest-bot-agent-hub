import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { BusinessApiContract } from '@repo/contracts/orpc';
import { AppService } from './app.service.js';

@Controller()
export class BusinessApiController {
  constructor(private readonly appService: AppService) {}

  @Implement(BusinessApiContract.greeting)
  greeting() {
    return implement(BusinessApiContract.greeting).handler(() =>
      this.appService.getHello(),
    );
  }
}
