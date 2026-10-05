import { Injectable } from '@nestjs/common';
import {
  RagBusinessGreetingResponseSchema,
  type RagBusinessGreetingResponse,
} from '@repo/contracts';

@Injectable()
export class GreetingService {
  getHello(): RagBusinessGreetingResponse {
    return RagBusinessGreetingResponseSchema.parse({ message: 'Hello World!' });
  }
}
