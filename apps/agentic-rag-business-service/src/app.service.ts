import { Injectable } from '@nestjs/common';
import { GreetingResponseSchema, type GreetingResponse } from '@repo/contracts';

@Injectable()
export class AppService {
  getHello(): GreetingResponse {
    return GreetingResponseSchema.parse({ message: 'Hello World!' });
  }
}
