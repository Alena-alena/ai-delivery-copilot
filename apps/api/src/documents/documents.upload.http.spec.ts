import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { DocumentJobs } from './document-jobs.js';
import { documents } from '../db/schema.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import { StorageService } from '../storage/storage.service.js';
import { as, createTestApp } from '../testing/test-app.js';

const sample = (name: string) =>
  readFileSync(path.resolve(import.meta.dirname, '../../../../samples', name));

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let storageDir: string;
const enqueueExtract = vi.fn<(id: string) => Promise<void>>();

const files = async () =>
  (await readdir(storageDir, { recursive: true, withFileTypes: true })).filter(
    (e) => e.isFile(),
  );

async function createProject(token = 'token-alice') {
  const res = await ctx
    .http()
    .post('/api/projects')
    .set(as(token))
    .send({ name: 'P' });
  return res.body.id as string;
}
const upload = (
  projectId: string,
  file: Buffer,
  filename: string,
  token = 'token-alice',
  contentType?: string,
) =>
  ctx
    .http()
    .post(`/api/projects/${projectId}/documents`)
    .set(as(token))
    .attach('file', file, { filename, contentType });

beforeAll(async () => {
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'copilot-upload-'));
  ctx = await createTestApp({
    controllers: [DocumentsController],
    providers: [
      DocumentsService,
      {
        provide: StorageService,
        useValue: new LocalStorageService(storageDir),
      },
      { provide: DocumentJobs, useValue: { enqueueExtract } },
    ],
  });
});
afterAll(async () => {
  await ctx?.close();
  await rm(storageDir, { recursive: true, force: true });
});
beforeEach(() => {
  enqueueExtract.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/projects/:id/documents', () => {
  it('stores a valid PDF, records it and queues extraction', async () => {
    const projectId = await createProject();
    const res = await upload(
      projectId,
      sample('01_clinicbook_requirements_en.pdf'),
      'spec.pdf',
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      projectId,
      name: 'spec.pdf',
      mime: 'application/pdf',
      status: 'uploaded',
      errorCode: null,
    });
    expect(enqueueExtract).toHaveBeenCalledExactlyOnceWith(res.body.id);

    // the file is stored under the documented key, and the row points at it
    const [row] = await ctx.db.select().from(documents);
    expect(row!.storageKey).toMatch(
      new RegExp(
        `^workspaces/[0-9a-f-]+/projects/${projectId}/documents/${res.body.id}/original\\.pdf$`,
      ),
    );
    expect(row!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await files()).map((f) => f.name)).toContain('original.pdf');
  });

  it('decides the type from the content, not from the browser header', async () => {
    const projectId = await createProject();
    const res = await upload(
      projectId,
      sample('04_vendor_notes_with_injection.txt'),
      'notes.txt',
      'token-alice',
      'application/pdf',
    );
    expect(res.status).toBe(201);
    expect(res.body.mime).toBe('text/plain');
  });

  it('keeps non-ASCII file names intact', async () => {
    const projectId = await createProject();
    const res = await upload(
      projectId,
      sample('03_client_email_ru_cp1251.txt'),
      'Письмо клиента.txt',
    );
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Письмо клиента.txt');
  });

  it('rejects an executable renamed to .pdf with 415 UNSUPPORTED_TYPE and stores nothing', async () => {
    const projectId = await createProject();
    const before = (await files()).length;
    const res = await upload(
      projectId,
      sample('07_fake_extension.pdf'),
      'fake.pdf',
    );
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_TYPE');
    expect((await files()).length).toBe(before);
    expect(enqueueExtract).not.toHaveBeenCalled();
  });

  it('rejects a damaged PDF with 422 FILE_CORRUPTED', async () => {
    const projectId = await createProject();
    const res = await upload(
      projectId,
      sample('06_corrupted.pdf'),
      'broken.pdf',
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('FILE_CORRUPTED');
  });

  it('rejects a file over 10 MB with 413 FILE_TOO_LARGE', async () => {
    const projectId = await createProject();
    const res = await upload(
      projectId,
      Buffer.alloc(10 * 1024 * 1024 + 1, 0x41),
      'big.txt',
    );
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects a request without a file (400)', async () => {
    const projectId = await createProject();
    const res = await ctx
      .http()
      .post(`/api/projects/${projectId}/documents`)
      .set(as('token-alice'));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it("answers 404 for another user's project and stores nothing", async () => {
    const projectId = await createProject('token-alice');
    const before = (await files()).length;
    const res = await upload(
      projectId,
      sample('01_clinicbook_requirements_en.pdf'),
      'x.pdf',
      'token-bob',
    );
    expect(res.status).toBe(404);
    expect((await files()).length).toBe(before);
  });

  it('requires a token', async () => {
    const projectId = await createProject();
    await ctx
      .http()
      .post(`/api/projects/${projectId}/documents`)
      .attach('file', sample('01_clinicbook_requirements_en.pdf'), 'x.pdf')
      .expect(401);
  });

  it('marks the document failed (retryable) when queuing fails, instead of leaving it stuck', async () => {
    enqueueExtract.mockRejectedValue(new Error('queue down'));
    const projectId = await createProject();
    const res = await upload(
      projectId,
      sample('01_clinicbook_requirements_en.pdf'),
      'spec.pdf',
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'extraction_failed',
      errorCode: 'EXTRACTION_FAILED',
    });
  });
});
