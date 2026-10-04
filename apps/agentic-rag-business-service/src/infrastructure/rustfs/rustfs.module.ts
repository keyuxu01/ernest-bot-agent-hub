import { Module } from '@nestjs/common';
import { RustfsService } from './rustfs.service';

/** RustFS（S3 兼容）对象存储基础设施 */
@Module({
  providers: [RustfsService],
  exports: [RustfsService],
})
export class RustfsModule {}
