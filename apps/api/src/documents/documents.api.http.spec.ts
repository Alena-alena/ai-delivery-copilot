import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { documentSegments, documents } from '../db/schema.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import { StorageService } from '../storage/storage.service.js';
import { as, createTestApp } from '../testing/test-app.js';
import { DocumentJobs } from './document-jobs.js';
import {
  DocumentsController,
  contentDisposition,
} from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

const sample = (name: string) =>
  readFileSync(path.resolve(import.meta.dirname, '../../../../samples', name));
const MISSING = '33333333-3333-4333-8333-333333333333';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let dir: string;
const enqueueExtract = vi.fn<(id: string) => Promise<void>>();

const files = async () =>
  (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) =>
    e.isFile(),
  );
const alice = as('token-alice');
const bob = as('token-bob');

async function project(token = alice) {
  return (await ctx.http().post('/api/projects').set(token).send({ name: 'P' }))
    .body.id as string;
}
async function upload(
  projectId: string,
  name = 'spec.pdf',
  file = '01_clinicbook_requirements_en.pdf',
) {
  const res = await ctx
    .http()
    .post(`/api/projects/${projectId}/documents`)
    .set(alice)
    .attach('file', sample(file), name);
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'copilot-docs-'));
  ctx = await createTestApp({
    controllers: [DocumentsController],
    providers: [
      DocumentsService,
      { provide: StorageService, useValue: new LocalStorageService(dir) },
      { provide: DocumentJobs, useValue: { enqueueExtract } },
    ],
  });
});
afterAll(async () => {
  await ctx?.close();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => enqueueExtract.mockReset().mockResolvedValue(undefined));

describe('listing and reading', () => {
  it("lists a project's documents newest first and shows one with its segments", async () => {
    const pid = await project();
    const first = await upload(pid, 'first.pdf');
    const second = await upload(pid, 'second.pdf');
    await ctx.db.insert(documentSegments).values([
      {
        documentId: first.id,
        index: 1,
        page: 2,
        text: 'second segment',
        tokenCount: 3,
      },
      {
        documentId: first.id,
        index: 0,
        page: 1,
        text: 'first segment',
        tokenCount: 3,
      },
    ]);

    const list = await ctx
      .http()
      .get(`/api/projects/${pid}/documents`)
      .set(alice)
      .expect(200);
    expect(list.body.map((d: { id: string }) => d.id)).toEqual([
      second.id,
      first.id,
    ]);

    const one = await ctx
      .http()
      .get(`/api/projects/${pid}/documents/${first.id}`)
      .set(alice)
      .expect(200);
    expect(one.body.segments.map((s: { text: string }) => s.text)).toEqual([
      'first segment',
      'second segment',
    ]); // ordered by index
  });

  it("returns 404 for another user's project and for a document of another project", async () => {
    const pid = await project();
    const other = await project();
    const doc = await upload(pid);

    await ctx.http().get(`/api/projects/${pid}/documents`).set(bob).expect(404);
    await ctx
      .http()
      .get(`/api/projects/${pid}/documents/${doc.id}`)
      .set(bob)
      .expect(404);
    await ctx
      .http()
      .get(`/api/projects/${other}/documents/${doc.id}`)
      .set(alice)
      .expect(404);
    await ctx
      .http()
      .get(`/api/projects/${pid}/documents/${MISSING}`)
      .set(alice)
      .expect(404);
  });
});

describe('deleting', () => {
  it('removes the row, its segments and the stored file', async () => {
    const pid = await project();
    const doc = await upload(pid);
    await ctx.db.insert(documentSegments).values({
      documentId: doc.id,
      index: 0,
      page: 1,
      text: 't',
      tokenCount: 1,
    });
    const before = (await files()).length;

    await ctx
      .http()
      .delete(`/api/projects/${pid}/documents/${doc.id}`)
      .set(alice)
      .expect(204);

    expect(
      await ctx.db.select().from(documents).where(eq(documents.id, doc.id)),
    ).toHaveLength(0);
    expect(
      await ctx.db
        .select()
        .from(documentSegments)
        .where(eq(documentSegments.documentId, doc.id)),
    ).toHaveLength(0);
    expect((await files()).length).toBe(before - 1);
    await ctx
      .http()
      .get(`/api/projects/${pid}/documents/${doc.id}`)
      .set(alice)
      .expect(404);
  });

  it("cannot delete someone else's document", async () => {
    const pid = await project();
    const doc = await upload(pid);
    await ctx
      .http()
      .delete(`/api/projects/${pid}/documents/${doc.id}`)
      .set(bob)
      .expect(404);
    await ctx
      .http()
      .get(`/api/projects/${pid}/documents/${doc.id}`)
      .set(alice)
      .expect(200);
  });

  it('deleting a project also removes its files', async () => {
    const pid = await project();
    await upload(pid, 'a.pdf');
    await upload(pid, 'b.pdf');
    const before = (await files()).length;
    await ctx.http().delete(`/api/projects/${pid}`).set(alice).expect(204);
    expect((await files()).length).toBe(before - 2);
  });
});

describe('retry', () => {
  it('runs extraction again for a failed document', async () => {
    const pid = await project();
    const doc = await upload(pid);
    await ctx.db
      .update(documents)
      .set({ status: 'extraction_failed', errorCode: 'EXTRACTION_FAILED' })
      .where(eq(documents.id, doc.id));
    enqueueExtract.mockClear();

    const res = await ctx
      .http()
      .post(`/api/projects/${pid}/documents/${doc.id}/retry`)
      .set(alice);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'uploaded', errorCode: null });
    expect(enqueueExtract).toHaveBeenCalledExactlyOnceWith(doc.id);
  });

  it('refuses to retry a document that is not failed (409)', async () => {
    const pid = await project();
    const doc = await upload(pid);
    const res = await ctx
      .http()
      .post(`/api/projects/${pid}/documents/${doc.id}/retry`)
      .set(alice);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it("cannot retry someone else's document", async () => {
    const pid = await project();
    const doc = await upload(pid);
    await ctx
      .http()
      .post(`/api/projects/${pid}/documents/${doc.id}/retry`)
      .set(bob)
      .expect(404);
  });
});

describe('download', () => {
  it('returns the original bytes as an attachment, with safe headers', async () => {
    const pid = await project();
    const doc = await upload(pid, 'Требования.pdf');
    const res = await ctx
      .http()
      .get(`/api/projects/${pid}/documents/${doc.id}/download`)
      .set(alice)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(
      "filename*=UTF-8''%D0%A2",
    );
    expect(
      Buffer.compare(
        res.body as Buffer,
        sample('01_clinicbook_requirements_en.pdf'),
      ),
    ).toBe(0);
  });

  it("cannot download someone else's file", async () => {
    const pid = await project();
    const doc = await upload(pid);
    await ctx
      .http()
      .get(`/api/projects/${pid}/documents/${doc.id}/download`)
      .set(bob)
      .expect(404);
    await ctx
      .http()
      .get(`/api/projects/${pid}/documents/${doc.id}/download`)
      .expect(401);
  });
});

describe('contentDisposition', () => {
  it('escapes quotes and keeps the real name in the RFC 5987 part', () => {
    const header = contentDisposition('a"b\\c.pdf');
    expect(header).toBe(
      'attachment; filename="a_b_c.pdf"; filename*=UTF-8\'\'a%22b%5Cc.pdf',
    );
  });
});
