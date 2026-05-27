export interface PipelineStepLog {
  filterName: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  outputImageUrl?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

export class PipelineContext {
  public readonly id: string;
  public currentImageUrl: string;
  public originalImageUrl: string;
  public prompt?: string;
  public options: Record<string, unknown> = {};
  public steps: PipelineStepLog[] = [];
  public metadata: Record<string, Record<string, unknown>> = {};
  public startTime: number;

  constructor(
    originalImageUrl: string,
    prompt?: string,
    options?: Record<string, unknown>,
  ) {
    this.id = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.originalImageUrl = originalImageUrl;
    this.currentImageUrl = originalImageUrl;
    this.prompt = prompt;
    this.options = options || {};
    this.startTime = Date.now();
  }

  public addStepLog(log: PipelineStepLog): void {
    this.steps.push(log);
  }

  public getElapsedTime(): number {
    return Date.now() - this.startTime;
  }
}
