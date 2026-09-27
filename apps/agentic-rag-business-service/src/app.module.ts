import { Module } from '@nestjs/common';
import { ORPCModule } from '@orpc/nest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BusinessApiController } from './business-api.controller.js';
import { OpenApiController } from './openapi.controller.js';

@Module({
  imports: [ORPCModule.forRoot({})],
  controllers: [AppController, BusinessApiController, OpenApiController],
  providers: [AppService],
})
export class AppModule {}
