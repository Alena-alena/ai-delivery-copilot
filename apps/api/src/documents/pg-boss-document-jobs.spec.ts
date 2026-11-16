import { PGlite } from '@electric-sql/pglite';
import { PgBoss, fromPglite } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { JobsService } from '../jobs/jobs.service.js';
import type { DocumentExtractionService } from './document-extraction.service.js';
import {
  EXTRACT_QUEUE,
  EXTRACT_RETRY_LIMIT,
  PgBossDocumentJobs,
} from './pg-boss-document-jobs.js';

/** A real pg-boss (its own SQL, queue and worker loop) running on in-process Postgres. */
let client: PGlite;
let boss: PgBoss;
let jobs: PgBossDocumentJobs;
const extract = vi.fn();

beforeAll(async () => {
  client = new PGlite();
  boss = new PgBoss({ db: fromPglite(client), schema: 'pgboss_test' });
  await boss.start();
  jobs = new PgBossDocumentJobs(
    { boss } as unknown as JobsService,
    { extract } as unknown as DocumentExtractionService,
  );
  await jobs.onModuleInit();
}, 30_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await client?.close();
});

describe('PgBossDocumentJobs', () => {
  it('creates the queue with the retry policy the extraction service relies on', async () => {
    const queue = await boss.getQueue(EXTRACT_QUEUE);
    expect(queue).toMatchObject({
      retryLimit: EXTRACT_RETRY_LIMIT,
      retryBackoff: true,
    });
    expect(EXTRACT_RETRY_LIMIT).toBe(3);
  });

  it('runs an enqueued document through the extraction service with its retry state', async () => {
    extract.mockResolvedValue(undefined);
    await jobs.enqueueExtract('11111111-1111-4111-8111-111111111111');

    await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(1), {
      timeout: 20_000,
      interval: 250,
    });
    expect(extract).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        retryCount: 0,
        retryLimit: EXTRACT_RETRY_LIMIT,
        requestId: expect.stringMatching(/^job-/),
      }),
    );
  }, 30_000);
});
