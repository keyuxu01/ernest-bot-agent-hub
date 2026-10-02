import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { BusinessApiContract } from '@repo/contracts/orpc';
import { GreetingService } from './greeting.service';

@Controller()
export class GreetingRpcController {
  constructor(private readonly greetingService: GreetingService) {}

  @Implement(BusinessApiContract.greeting)
  greeting() {
    return implement(BusinessApiContract.greeting).handler(() =>
      this.greetingService.getHello(),
    );
  }
}
