import { Injectable } from '@nestjs/common';
import type { GreetingResponse } from '@repo/types';

@Injectable()
export class AppService {
  getHello(): GreetingResponse {
    return { message: 'Hello World!' };
  }
}
