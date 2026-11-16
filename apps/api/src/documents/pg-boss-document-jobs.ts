import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service.js';
import { DocumentJobs } from './document-jobs.js';
import { DocumentExtractionService } from './document-extraction.service.js';

export const EXTRACT_QUEUE = 'document.extract';
/** pg-boss retries a failed job this many times (with backoff) before giving up. */
export const EXTRACT_RETRY_LIMIT = 3;

/** Queues and runs `document.extract` jobs on pg-boss. */
@Injectable()
export class PgBossDocumentJobs extends DocumentJobs implements OnModuleInit {
  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(DocumentExtractionService)
    private readonly extraction: DocumentExtractionService,
  ) {
    super();
  }

  async onModuleInit() {
    const { boss } = this.jobs;
    await boss.createQueue(EXTRACT_QUEUE, {
      retryLimit: EXTRACT_RETRY_LIMIT,
      retryDelay: 10,
      retryBackoff: true,
      // A job still "active" after this long (a crashed API, a hung call) goes back to the queue.
      expireInSeconds: 180,
    });
    await boss.work<
      { documentId: string },
      void,
      { includeMetadata: true; localConcurrency: number }
    >(
      EXTRACT_QUEUE,
      { includeMetadata: true, localConcurrency: 2 },
      async (jobs) => {
        for (const job of jobs) {
          await this.extraction.extract(job.data.documentId, {
            retryCount: job.retryCount,
            retryLimit: job.retryLimit,
            requestId: `job-${job.id}`,
          });
        }
      },
    );
  }

  async enqueueExtract(documentId: string): Promise<void> {
    await this.jobs.boss.send(EXTRACT_QUEUE, { documentId });
  }
}
