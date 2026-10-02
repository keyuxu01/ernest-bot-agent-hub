import { Test, TestingModule } from '@nestjs/testing';
import { GreetingResponseSchema } from '@repo/contracts';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns the service greeting', () => {
      const response = appController.getHello();

      expect(GreetingResponseSchema.safeParse(response).success).toBe(true);
      expect(response).toEqual({
        message: 'Hello from mcp-app-collections!',
      });
    });
  });
});
