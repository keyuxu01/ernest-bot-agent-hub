import { Test, type TestingModule } from '@nestjs/testing';
import { call } from '@orpc/server';
import { GreetingResponseSchema } from '@repo/contracts';
import { GreetingRpcController } from './greeting-rpc.controller';
import { GreetingService } from './greeting.service';

describe('GreetingRpcController', () => {
  let controller: GreetingRpcController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [GreetingRpcController],
      providers: [GreetingService],
    }).compile();

    controller = app.get<GreetingRpcController>(GreetingRpcController);
  });

  it('returns a contract-valid greeting', async () => {
    const response = await call(controller.greeting(), undefined);

    expect(GreetingResponseSchema.safeParse(response).success).toBe(true);
    expect(response).toEqual({ message: 'Hello World!' });
  });
});
