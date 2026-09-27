import { Test, type TestingModule } from '@nestjs/testing';
import { call } from '@orpc/server';
import { GreetingResponseSchema } from '@repo/contracts';
import { AppService } from './app.service.js';
import { BusinessApiController } from './business-api.controller.js';

describe('BusinessApiController', () => {
  let controller: BusinessApiController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [BusinessApiController],
      providers: [AppService],
    }).compile();

    controller = app.get<BusinessApiController>(BusinessApiController);
  });

  it('returns a contract-valid greeting', async () => {
    const response = await call(controller.greeting(), undefined);

    expect(GreetingResponseSchema.safeParse(response).success).toBe(true);
    expect(response).toEqual({ message: 'Hello World!' });
  });
});
