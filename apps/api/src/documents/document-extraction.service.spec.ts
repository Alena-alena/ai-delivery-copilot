import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { AiClient } from '../ai/ai.client.js';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { documentSegments, documents } from '../db/schema.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import { as, createTestApp } from '../testing/test-app.js';
import {
  DocumentExtractionService,
  type ExtractResponse,
} from './document-extraction.service.js';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let dir: string;
let storage: LocalStorageService;
let limit = 1000;
const postBytes = vi.fn();
let service: DocumentExtractionService;
let projectId: string;

const FIRST: ExtractResponse = {
  page_count: 2,
  token_count: 30,
  encoding: null,
  segments: [
    { index: 0, page: 1, text: 'Page one text', token_count: 10 },
    { index: 1, page: 2, text: 'Page two text', token_count: 20 },
  ],
};
const attempt = (retryCount = 0) => ({
  retryCount,
  retryLimit: 3,
  requestId: 'job-1',
});

async function addDocument(name = 'a.pdf', inProject?: string) {
  const key = `k/${name}-${Math.random()}`;
  await storage.put(key, Buffer.from('file-bytes'));
  const [row] = await ctx.db
    .insert(documents)
    .values({
      projectId: inProject ?? projectId,
      name,
      mime: 'application/pdf',
      size: 10,
      sha256: 'x'.repeat(64),
      storageKey: key,
    })
    .returning();
  return row!;
}
const reload = async (id: string) =>
  (await ctx.db.select().from(documents).where(eq(documents.id, id)))[0]!;
const segmentsOf = (id: string) =>
  ctx.db
    .select()
    .from(documentSegments)
    .where(eq(documentSegments.documentId, id));

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'copilot-extract-'));
  storage = new LocalStorageService(dir);
  ctx = await createTestApp();
  const res = await ctx
    .http()
    .post('/api/projects')
    .set(as('token-alice'))
    .send({ name: 'P' });
  projectId = res.body.id;
  service = new DocumentExtractionService(
    ctx.db,
    storage,
    { postBytes } as unknown as AiClient,
    { get: () => limit } as unknown as ConfigService<Env, true>,
  );
});
afterAll(async () => {
  await ctx?.close();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  limit = 1000;
  postBytes.mockReset().mockResolvedValue(FIRST);
});

describe('DocumentExtractionService', () => {
  it('stores segments and marks the document extracted', async () => {
    const doc = await addDocument();
    await service.extract(doc.id, attempt());

    expect(postBytes).toHaveBeenCalledWith(
      '/v1/documents/extract',
      Buffer.from('file-bytes'),
      'job-1',
      expect.objectContaining({ query: { mime: 'application/pdf' } }),
    );
    const row = await reload(doc.id);
    expect(row).toMatchObject({
      status: 'extracted',
      errorCode: null,
      pageCount: 2,
      tokenCount: 30,
    });
    const segs = await segmentsOf(doc.id);
    expect(segs.map((s) => [s.index, s.page, s.text])).toEqual(
      expect.arrayContaining([
        [0, 1, 'Page one text'],
        [1, 2, 'Page two text'],
      ]),
    );
  });

  it('is idempotent: a re-delivered job does not run twice or duplicate segments', async () => {
    const doc = await addDocument();
    await service.extract(doc.id, attempt());
    await service.extract(doc.id, attempt());
    expect(postBytes).toHaveBeenCalledTimes(1); // already extracted: skipped
    expect(await segmentsOf(doc.id)).toHaveLength(2);
  });

  it('replaces old segments when a half-finished document is processed again', async () => {
    const doc = await addDocument();
    await ctx.db
      .update(documents)
      .set({ status: 'extracting' })
      .where(eq(documents.id, doc.id));
    await ctx.db.insert(documentSegments).values({
      documentId: doc.id,
      index: 0,
      page: 1,
      text: 'stale',
      tokenCount: 1,
    });
    await service.extract(doc.id, attempt());
    const segs = await segmentsOf(doc.id);
    expect(segs).toHaveLength(2);
    expect(segs.some((s) => s.text === 'stale')).toBe(false);
  });

  it('does nothing for a document that was deleted while queued', async () => {
    await service.extract('99999999-9999-4999-8999-999999999999', attempt());
    expect(postBytes).not.toHaveBeenCalled();
  });

  it('marks a permanently unreadable document failed with the typed code, without retrying', async () => {
    postBytes.mockRejectedValue(
      new HttpException({ code: 'PDF_NO_TEXT_LAYER', message: 'scan' }, 422),
    );
    const doc = await addDocument('scan.pdf');
    await expect(service.extract(doc.id, attempt(0))).resolves.toBeUndefined();
    expect(await reload(doc.id)).toMatchObject({
      status: 'extraction_failed',
      errorCode: 'PDF_NO_TEXT_LAYER',
    });
    expect(await segmentsOf(doc.id)).toHaveLength(0);
  });

  it('rethrows temporary failures so the queue retries, keeping the document in "extracting"', async () => {
    postBytes.mockRejectedValue(
      new GatewayTimeoutException({ code: 'AI_TIMEOUT', message: 't' }),
    );
    const doc = await addDocument();
    await expect(service.extract(doc.id, attempt(1))).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
    expect((await reload(doc.id)).status).toBe('extracting');
  });

  it('gives up after the last retry: failed with EXTRACTION_FAILED, job completes', async () => {
    postBytes.mockRejectedValue(
      new BadGatewayException({ code: 'AI_UNAVAILABLE', message: 'x' }),
    );
    const doc = await addDocument();
    await expect(service.extract(doc.id, attempt(3))).resolves.toBeUndefined();
    expect(await reload(doc.id)).toMatchObject({
      status: 'extraction_failed',
      errorCode: 'EXTRACTION_FAILED',
    });
  });

  it('treats a missing stored file like a temporary failure, then fails it', async () => {
    const doc = await addDocument();
    await storage.delete((await reload(doc.id)).storageKey);
    await expect(service.extract(doc.id, attempt(0))).rejects.toThrow();
    await expect(service.extract(doc.id, attempt(3))).resolves.toBeUndefined();
    expect((await reload(doc.id)).status).toBe('extraction_failed');
  });

  it('rejects a document that would push the project over its text limit', async () => {
    limit = 40; // FIRST is 30 tokens; a second 30-token document must not fit
    // a fresh project, so documents extracted by other tests do not count towards the limit
    const fresh = (
      await ctx
        .http()
        .post('/api/projects')
        .set(as('token-alice'))
        .send({ name: 'Limit' })
    ).body.id as string;
    const a = await addDocument('first.pdf', fresh);
    const b = await addDocument('second.pdf', fresh);
    await service.extract(a.id, attempt());
    await service.extract(b.id, attempt());
    expect((await reload(a.id)).status).toBe('extracted');
    expect(await reload(b.id)).toMatchObject({
      status: 'extraction_failed',
      errorCode: 'PROJECT_TEXT_LIMIT',
    });
    expect(await segmentsOf(b.id)).toHaveLength(0);
  });
});
