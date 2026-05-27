import { Injectable, Logger } from '@nestjs/common';
import { IFilter } from './interfaces/filter.interface';
import { PipelineContext } from './pipeline.context';

@Injectable()
export class PipelineProcessor {
  private readonly logger = new Logger(PipelineProcessor.name);

  public async run(
    context: PipelineContext,
    filters: IFilter[],
  ): Promise<PipelineContext> {
    this.logger.log(
      `Bắt đầu chạy Pipeline [ID: ${context.id}] với ${filters.length} filters.`,
    );

    for (const filter of filters) {
      const stepStartTime = Date.now();
      try {
        this.logger.log(`Executing filter: ${filter.name}...`);
        context = await filter.execute(context);

        context.addStepLog({
          filterName: filter.name,
          status: 'SUCCESS',
          durationMs: Date.now() - stepStartTime,
          outputImageUrl: context.currentImageUrl,
          metadata: { ...context.metadata[filter.name] },
        });
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Lỗi tại filter ${filter.name}: ${err.message}`,
          err.stack,
        );

        context.addStepLog({
          filterName: filter.name,
          status: 'FAILED',
          durationMs: Date.now() - stepStartTime,
          errorMessage: err.message,
        });

        throw err;
      }
    }

    this.logger.log(
      `Hoàn thành Pipeline [ID: ${context.id}] trong ${context.getElapsedTime()}ms`,
    );
    return context;
  }
}
