import { Module } from '@nestjs/common';
import { GreetingController } from './greeting.controller';
import { GreetingRpcController } from './greeting-rpc.controller';
import { GreetingService } from './greeting.service';

@Module({
  controllers: [GreetingController, GreetingRpcController],
  providers: [GreetingService],
})
export class GreetingModule {}
