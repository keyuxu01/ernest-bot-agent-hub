import { Test, TestingModule } from '@nestjs/testing';
import { GreetingResponseSchema } from '@repo/contracts';
import { GreetingController } from './greeting.controller';
import { GreetingService } from './greeting.service';

describe('GreetingController', () => {
  let greetingController: GreetingController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [GreetingController],
      providers: [GreetingService],
    }).compile();

    greetingController = app.get<GreetingController>(GreetingController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      const response = greetingController.getHello();

      expect(GreetingResponseSchema.safeParse(response).success).toBe(true);
      expect(response).toEqual({ message: 'Hello World!' });
    });
  });
});
