import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { AssistantRuntimePingResponse } from '@repo/contracts';
import type { Response } from 'express';
import { AssistantService } from './assistant.service';

@Controller('assistant')
class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get('ping')
  ping(): AssistantRuntimePingResponse {
    return this.assistantService.ping();
  }

  @Get('stream')
  @Header('Content-Type', 'text/event-stream; charset=utf-8')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('Connection', 'keep-alive')
  stream(
    @Query('prompt') prompt: string | undefined,
    @Res() response: Response,
  ): void {
    response.status(200);
    for (const chunk of this.assistantService.streamStubChunks(prompt ?? '')) {
      response.write(chunk);
    }
    response.end();
  }
}

export { AssistantController };
