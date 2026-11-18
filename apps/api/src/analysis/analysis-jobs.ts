/** Background work for analysis. Implemented with pg-boss; faked in tests. */
export abstract class AnalysisJobs {
  /** Queues the execution of an analysis run that was just created. */
  abstract enqueueRun(runId: string): Promise<void>;
}
