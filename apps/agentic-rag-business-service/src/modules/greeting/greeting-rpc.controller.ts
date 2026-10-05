import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { RagBusinessApiContract } from '@repo/contracts/orpc';
import { GreetingService } from './greeting.service';

@Controller()
export class GreetingRpcController {
  constructor(private readonly greetingService: GreetingService) {}

  @Implement(RagBusinessApiContract.greeting)
  greeting() {
    return implement(RagBusinessApiContract.greeting).handler(() =>
      this.greetingService.getHello(),
    );
  }
}
