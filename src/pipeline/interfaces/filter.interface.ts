import { PipelineContext } from '../pipeline.context';

export interface IFilter {
  readonly name: string;
  execute(context: PipelineContext): Promise<PipelineContext>;
}
