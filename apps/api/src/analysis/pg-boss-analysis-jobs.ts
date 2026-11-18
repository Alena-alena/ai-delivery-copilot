import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service.js';
import { AnalysisJobs } from './analysis-jobs.js';
import { AnalysisRunner } from './analysis-runner.service.js';

export const ANALYSIS_QUEUE = 'analysis.run';

/** Queues and runs `analysis.run` jobs on pg-boss. */
@Injectable()
export class PgBossAnalysisJobs extends AnalysisJobs implements OnModuleInit {
  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(AnalysisRunner) private readonly runner: AnalysisRunner,
  ) {
    super();
  }

  async onModuleInit() {
    const { boss } = this.jobs;
    await boss.createQueue(ANALYSIS_QUEUE, {
      // No automatic retry: every attempt costs money, and the user decides to try again.
      retryLimit: 0,
      // A run still "active" after this long (a crashed API) is released; the runner then marks it failed.
      expireInSeconds: 1200,
    });
    await boss.work<
      { runId: string },
      void,
      { includeMetadata: true; localConcurrency: number }
    >(
      ANALYSIS_QUEUE,
      { includeMetadata: true, localConcurrency: 2 },
      async (jobs) => {
        for (const job of jobs) {
          await this.runner.execute(job.data.runId, `job-${job.id}`);
        }
      },
    );
  }

  async enqueueRun(runId: string): Promise<void> {
    await this.jobs.boss.send(ANALYSIS_QUEUE, { runId });
  }
}
