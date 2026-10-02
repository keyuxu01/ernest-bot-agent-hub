import { Injectable } from '@nestjs/common';
import { GreetingResponseSchema, type GreetingResponse } from '@repo/contracts';

@Injectable()
export class GreetingService {
  getHello(): GreetingResponse {
    return GreetingResponseSchema.parse({ message: 'Hello World!' });
  }
}
