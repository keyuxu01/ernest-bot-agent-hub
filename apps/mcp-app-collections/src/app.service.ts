import { Injectable } from '@nestjs/common';
import { McpHelloResponseSchema, type McpHelloResponse } from '@repo/contracts';

@Injectable()
export class AppService {
  getHello(): McpHelloResponse {
    return McpHelloResponseSchema.parse({
      message: 'Hello from mcp-app-collections!',
    });
  }
}
