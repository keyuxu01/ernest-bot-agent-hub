import { Controller, Get } from '@nestjs/common';
import { OpenAPIGenerator, type OpenAPI } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { RagBusinessApiContract } from '@repo/contracts/orpc';

const openApiGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

@Controller()
export class OpenApiController {
  @Get('openapi.json')
  getDocument(): Promise<OpenAPI.Document> {
    return openApiGenerator.generate(RagBusinessApiContract, {
      info: {
        title: 'Agentic RAG Business API',
        version: '0.1.0',
      },
    });
  }
}
