import { Module } from '@nestjs/common';
import { PipelineModule } from './pipeline/pipeline.module';

@Module({
  imports: [PipelineModule],
})
export class AppModule {}
