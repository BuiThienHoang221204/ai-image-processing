import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { PipelineProcessor } from './pipeline.processor';
import { LocalRembgFilter } from './filters/local-rembg.filter';
import { LocalSharpFilter } from './filters/local-sharp.filter';
import { OpenRouterDetectFilter } from './filters/openrouter-detect.filter';
import { LocalInpaintFilter } from './filters/local-inpaint.filter';
import { StorageService } from './services/storage.service';
import { S3DownloaderService } from './services/s3-downloader.service';

@Module({
  controllers: [PipelineController],
  providers: [
    PipelineProcessor,
    OpenRouterDetectFilter,
    LocalInpaintFilter,
    LocalRembgFilter,
    LocalSharpFilter,
    StorageService,
    S3DownloaderService,
  ],
  exports: [PipelineProcessor, StorageService, S3DownloaderService],
})
export class PipelineModule {}
