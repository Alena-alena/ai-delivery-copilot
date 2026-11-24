import { ConfigService } from '@nestjs/config';
import { GatewayTimeoutException, HttpException } from '@nestjs/common';
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
import { AiClient } from '../ai/ai.client.js';
import {
  analysisRuns,
  documentSegments,
  documents,
  requirements,
} from '../db/schema.js';
import { as, createTestApp } from '../testing/test-app.js';
import { AnalysisJobs } from './analysis-jobs.js';
import {
  AnalysisRunner,
  failureCode,
  titleKey,
  type GapsResponse,
  type RequirementsResponse,
} from './analysis-runner.service.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let runner: AnalysisRunner;
const post = vi.fn();
const postGaps = vi.fn();
const enqueueRun = vi.fn<(id: string) => Promise<void>>();
const alice = as('token-alice');
const bob = as('token-bob');

beforeAll(async () => {
  ctx = await createTestApp({
    controllers: [AnalysisController],
    providers: [
      AnalysisService,
      AnalysisRunner,
      { provide: AnalysisJobs, useValue: { enqueueRun } },
      {
        provide: AiClient,
        // /gaps has its own mock, so the existing tests keep using `post` for the requirements call only
        useValue: {
          post: (path: string, ...rest: unknown[]) =>
            path.endsWith('/gaps')
              ? postGaps(path, ...rest)
              : post(path, ...rest),
        },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (k: string) =>
            k === 'AI_ANALYSIS_TIMEOUT_MS'
              ? 1000
              : k === 'ANALYSIS_COST_PER_MTOK_USD'
                ? 2
                : undefined,
        },
      },
    ],
  });
  runner = ctx.app.get(AnalysisRunner);
});
afterAll(() => ctx.close());
beforeEach(() => {
  post.mockReset();
  postGaps.mockReset().mockResolvedValue(gapsAnswer([]));
  enqueueRun.mockReset().mockResolvedValue(undefined);
});

async function project(token = alice) {
  return (await ctx.http().post('/api/projects').set(token).send({ name: 'P' }))
    .body.id as string;
}

/** An extracted document with one segment per text, inserted directly (extraction has its own tests). */
async function doc(
  projectId: string,
  name: string,
  texts: string[],
  status: 'extracted' | 'uploaded' | 'extraction_failed' = 'extracted',
  errorCode?: string,
) {
  const [d] = await ctx.db
    .insert(documents)
    .values({
      projectId,
      name,
      mime: 'text/plain',
      size: 10,
      sha256: `${name}-${Math.random()}`,
      storageKey: `k/${name}`,
      status,
      errorCode: errorCode ?? null,
      tokenCount: status === 'extracted' ? texts.length * 100 : null,
    })
    .returning();
  if (texts.length === 0) return { id: d!.id, segs: [] };
  const segs = await ctx.db
    .insert(documentSegments)
    .values(
      texts.map((text, index) => ({
        documentId: d!.id,
        index,
        page: index + 1,
        text,
        tokenCount: 100,
      })),
    )
    .returning();
  return { id: d!.id, segs };
}

const reqOut = (
  title: string,
  documentId: string,
  segmentId: string,
  over: Partial<RequirementsResponse['requirements'][number]> = {},
): RequirementsResponse['requirements'][number] => ({
  title,
  description: `${title} description`,
  type: 'functional',
  priority: 'high',
  confidence: 'high',
  ai_comment: '',
  source_unverified: false,
  sources: [
    { document_id: documentId, segment_id: segmentId, quote: 'quote text' },
  ],
  ...over,
});
const aiAnswer = (
  items: RequirementsResponse['requirements'],
): RequirementsResponse => ({
  requirements: items,
  usage: {
    calls: 1,
    prompt_tokens: 1000,
    completion_tokens: 200,
    cost_usd: 0.0123,
    model: 'default-llm',
  },
  prompt_version: 'requirements/v1',
});

const gapOut = (
  text: string,
  over: Partial<GapsResponse['gaps'][number]> = {},
): GapsResponse['gaps'][number] => ({
  type: 'missing_information',
  severity: 'high',
  text,
  requirement_refs: [],
  question: `Question about: ${text}`,
  ...over,
});
const gapsAnswer = (items: GapsResponse['gaps']): GapsResponse => ({
  gaps: items,
  usage: {
    calls: 1,
    prompt_tokens: 100,
    completion_tokens: 20,
    cost_usd: 0.001,
    model: 'default-llm',
  },
  prompt_version: 'gaps/v1',
});
const listGaps = async (projectId: string) =>
  (await ctx.http().get(`/api/projects/${projectId}/gaps`).set(alice))
    .body as Array<{
    id: string;
    number: number;
    text: string;
    status: string;
    note: string;
    requirementNumbers: number[];
  }>;

/** Starts a run through the API and executes it like the worker would. */
async function runOnce(projectId: string) {
  const started = await ctx
    .http()
    .post(`/api/projects/${projectId}/analysis`)
    .set(alice);
  expect(started.status).toBe(201);
  await runner.execute(started.body.id, 'job-test');
  return started.body.id as string;
}
const listReqs = async (projectId: string) =>
  (await ctx.http().get(`/api/projects/${projectId}/requirements`).set(alice))
    .body as Array<{
    id: string;
    number: number;
    title: string;
    status: string;
    editedByUser: boolean;
    sources: Array<{ page: number | null; documentName: string }>;
  }>;

describe('overview and start', () => {
  it('lists what a run would read, what it would skip and why, and an estimate', async () => {
    const pid = await project();
    await doc(pid, 'spec.pdf', ['a', 'b']);
    await doc(pid, 'scan.pdf', ['x'], 'extraction_failed', 'PDF_NO_TEXT_LAYER');
    await doc(pid, 'new.txt', [], 'uploaded');
    const res = await ctx
      .http()
      .get(`/api/projects/${pid}/analysis`)
      .set(alice);
    expect(res.status).toBe(200);
    expect(res.body.run).toBeNull();
    expect(res.body.included.map((d: { name: string }) => d.name)).toEqual([
      'spec.pdf',
    ]);
    expect(res.body.excluded.map((d: { reason: string }) => d.reason)).toEqual([
      expect.stringContaining('no text layer'),
      'Still being processed',
    ]);
    expect(res.body.estimate).toEqual({ tokens: 200, costUsd: 0.0004 });
  });

  it('refuses to start without a ready document', async () => {
    const pid = await project();
    await doc(pid, 'new.txt', [], 'uploaded');
    const res = await ctx
      .http()
      .post(`/api/projects/${pid}/analysis`)
      .set(alice);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_DOCUMENTS_READY');
    expect(enqueueRun).not.toHaveBeenCalled();
  });

  it('creates a queued run, queues it, and allows only one active run per project', async () => {
    const pid = await project();
    await doc(pid, 'spec.pdf', ['a']);
    const first = await ctx
      .http()
      .post(`/api/projects/${pid}/analysis`)
      .set(alice);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: 'queued', documentCount: 1 });
    expect(enqueueRun).toHaveBeenCalledExactlyOnceWith(first.body.id);
    const second = await ctx
      .http()
      .post(`/api/projects/${pid}/analysis`)
      .set(alice);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ANALYSIS_ALREADY_RUNNING');
  });

  it('two simultaneous starts create exactly one run', async () => {
    const pid = await project();
    await doc(pid, 'spec.pdf', ['a']);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        ctx.http().post(`/api/projects/${pid}/analysis`).set(alice),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(
      results.filter((r) => r.body.code === 'ANALYSIS_ALREADY_RUNNING'),
    ).toHaveLength(2);
  });

  it('marks the run failed, not stuck, when it cannot be queued', async () => {
    const pid = await project();
    await doc(pid, 'spec.pdf', ['a']);
    enqueueRun.mockRejectedValueOnce(new Error('queue down'));
    const res = await ctx
      .http()
      .post(`/api/projects/${pid}/analysis`)
      .set(alice);
    expect(res.body).toMatchObject({
      status: 'failed',
      errorCode: 'ANALYSIS_FAILED',
    });
    enqueueRun.mockResolvedValue(undefined);
    expect(
      (await ctx.http().post(`/api/projects/${pid}/analysis`).set(alice))
        .status,
    ).toBe(201);
  });

  it("another user's project is a 404 on every route", async () => {
    const pid = await project();
    const fake = '33333333-3333-4333-8333-333333333333';
    for (const [method, url] of [
      ['get', `/api/projects/${pid}/analysis`],
      ['post', `/api/projects/${pid}/analysis`],
      ['post', `/api/projects/${pid}/analysis/cancel`],
      ['get', `/api/projects/${pid}/requirements`],
      ['patch', `/api/projects/${pid}/requirements/${fake}`],
      ['post', `/api/projects/${pid}/requirements/confirm`],
    ] as const) {
      const res = await ctx
        .http()
        [method](url)
        .set(bob)
        .send({ ids: [fake], status: 'confirmed' });
      expect(res.status, `${method} ${url}`).toBe(404);
    }
  });
});

describe('stale runs', () => {
  it('marks a run that has been active for far too long as failed, so a new one can start', async () => {
    const pid = await project();
    await doc(pid, 'spec.pdf', ['a']);
    await ctx.db.insert(analysisRuns).values({
      projectId: pid,
      status: 'running',
      createdAt: new Date(Date.now() - 60 * 60 * 1000), // an hour ago: the worker is gone
    });
    const overview = await ctx
      .http()
      .get(`/api/projects/${pid}/analysis`)
      .set(alice);
    expect(overview.body.run).toMatchObject({
      status: 'failed',
      errorCode: 'ANALYSIS_FAILED',
    });
    expect(
      (await ctx.http().post(`/api/projects/${pid}/analysis`).set(alice))
        .status,
    ).toBe(201);
  });

  it('leaves a recent active run alone', async () => {
    const pid = await project();
    await doc(pid, 'spec.pdf', ['a']);
    await ctx
      .http()
      .post(`/api/projects/${pid}/analysis`)
      .set(alice)
      .expect(201);
    const overview = await ctx
      .http()
      .get(`/api/projects/${pid}/analysis`)
      .set(alice);
    expect(overview.body.run.status).toBe('queued');
  });
});

describe('executing a run', () => {
  it('sends the segments, saves numbered requirements with page and quote, and records usage', async () => {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', [
      'Patients can book online.',
      'Data stays in the EU.',
    ]);
    post.mockResolvedValue(
      aiAnswer([
        reqOut('Online booking', d.id, d.segs[0]!.id),
        reqOut('EU storage', d.id, d.segs[1]!.id),
      ]),
    );
    const runId = await runOnce(pid);

    const sent = post.mock.calls[0]!;
    expect(sent[0]).toBe('/v1/analysis/requirements');
    expect(sent[1].documents[0]).toMatchObject({ id: d.id, name: 'spec.pdf' });
    expect(sent[1].documents[0].segments).toEqual([
      { id: d.segs[0]!.id, page: 1, text: 'Patients can book online.' },
      { id: d.segs[1]!.id, page: 2, text: 'Data stays in the EU.' },
    ]);
    expect(sent[3]).toBe(1000); // the long analysis timeout

    const list = await listReqs(pid);
    expect(list.map((r) => [r.number, r.title, r.status])).toEqual([
      [1, 'Online booking', 'ai_suggested'],
      [2, 'EU storage', 'ai_suggested'],
    ]);
    expect(list[1]!.sources[0]).toMatchObject({
      page: 2,
      documentName: 'spec.pdf',
    });

    const [run] = await ctx.db
      .select()
      .from(analysisRuns)
      .where(eq(analysisRuns.id, runId));
    expect(run).toMatchObject({
      status: 'succeeded',
      requirementsFound: 2,
      promptVersion: 'requirements/v1 + gaps/v1',
      promptTokens: 1100,
      completionTokens: 220,
      costUsd: 0.0133,
      model: 'default-llm',
    });
    expect(run!.finishedAt).not.toBeNull();
  });

  it('a re-run keeps what a person touched, replaces untouched suggestions and does not repeat titles', async () => {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', ['t1', 't2', 't3']);
    const seg = (i: number) => d.segs[i]!.id;
    post.mockResolvedValueOnce(
      aiAnswer([
        reqOut('Booking', d.id, seg(0)),
        reqOut('Reminders', d.id, seg(1)),
        reqOut('Slots', d.id, seg(2)),
      ]),
    );
    await runOnce(pid);
    const [booking, reminders, slots] = await listReqs(pid);
    await ctx
      .http()
      .patch(`/api/projects/${pid}/requirements/${booking!.id}`)
      .set(alice)
      .send({ status: 'confirmed' });
    await ctx
      .http()
      .patch(`/api/projects/${pid}/requirements/${reminders!.id}`)
      .set(alice)
      .send({ title: 'Reminder 24h', priority: 'low' });
    // slots stays an untouched AI suggestion

    post.mockResolvedValueOnce(
      aiAnswer([
        reqOut('booking!', d.id, seg(0)), // repeats a confirmed one: not added again
        reqOut('Reminder 24h', d.id, seg(1)), // repeats an edited one
        reqOut('Payments', d.id, seg(2)), // new
      ]),
    );
    await runOnce(pid);

    const after = await listReqs(pid);
    expect(
      after.map((r) => [r.number, r.title, r.status, r.editedByUser]),
    ).toEqual([
      [1, 'Booking', 'confirmed', false],
      [2, 'Reminder 24h', 'ai_suggested', true],
      [4, 'Payments', 'ai_suggested', false], // 3 was the replaced untouched "Slots": its number is not reused
    ]);
    expect(after.some((r) => r.id === slots!.id)).toBe(false);
  });

  it('records a failure on the run with a user-facing code, and the project can start again', async () => {
    const pid = await project();
    await doc(pid, 'spec.pdf', ['a']);
    post.mockRejectedValue(
      new GatewayTimeoutException({ code: 'AI_TIMEOUT', message: 'slow' }),
    );
    const runId = await runOnce(pid);
    const [run] = await ctx.db
      .select()
      .from(analysisRuns)
      .where(eq(analysisRuns.id, runId));
    expect(run).toMatchObject({
      status: 'failed',
      errorCode: 'ANALYSIS_TIMEOUT',
    });
    expect(await listReqs(pid)).toEqual([]);
    expect(
      (await ctx.http().post(`/api/projects/${pid}/analysis`).set(alice))
        .status,
    ).toBe(201);
  });

  it('maps AI service error codes to run error codes', () => {
    const e = (code: string, status = 502) =>
      new HttpException({ code }, status);
    expect(failureCode(e('LLM_TIMEOUT', 504))).toBe('ANALYSIS_TIMEOUT');
    expect(failureCode(e('LLM_RATE_LIMITED', 429))).toBe('ANALYSIS_BUSY');
    expect(failureCode(e('LLM_INVALID_RESPONSE'))).toBe(
      'ANALYSIS_INVALID_RESPONSE',
    );
    expect(failureCode(e('AI_ERROR'))).toBe('ANALYSIS_FAILED');
    expect(failureCode(new Error('boom'))).toBe('ANALYSIS_FAILED');
  });

  it('does not run a job twice or a run that was cancelled while queued', async () => {
    const pid = await project();
    await doc(pid, 'spec.pdf', ['a']);
    const started = await ctx
      .http()
      .post(`/api/projects/${pid}/analysis`)
      .set(alice);
    await ctx
      .http()
      .post(`/api/projects/${pid}/analysis/cancel`)
      .set(alice)
      .expect(200);
    await runner.execute(started.body.id, 'job-1');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('cancel', () => {
  it('discards results that arrive after the user cancelled', async () => {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', ['a']);
    let finishAi!: (v: RequirementsResponse) => void;
    post.mockReturnValue(
      new Promise<RequirementsResponse>((r) => (finishAi = r)),
    );
    const started = await ctx
      .http()
      .post(`/api/projects/${pid}/analysis`)
      .set(alice);
    const running = runner.execute(started.body.id, 'job-1');
    await vi.waitFor(() => expect(post).toHaveBeenCalled());

    const cancelled = await ctx
      .http()
      .post(`/api/projects/${pid}/analysis/cancel`)
      .set(alice);
    expect(cancelled.body.status).toBe('cancelled');
    finishAi(aiAnswer([reqOut('Late result', d.id, d.segs[0]!.id)]));
    await running;

    expect(await listReqs(pid)).toEqual([]);
    const [run] = await ctx.db
      .select()
      .from(analysisRuns)
      .where(eq(analysisRuns.id, started.body.id));
    expect(run!.status).toBe('cancelled');
  });

  it('answers 409 when nothing is running', async () => {
    const pid = await project();
    expect(
      (await ctx.http().post(`/api/projects/${pid}/analysis/cancel`).set(alice))
        .status,
    ).toBe(409);
  });
});

describe('reviewing requirements', () => {
  async function setup() {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', ['a', 'b']);
    post.mockResolvedValue(
      aiAnswer([
        reqOut('One', d.id, d.segs[0]!.id),
        reqOut('Two', d.id, d.segs[1]!.id),
      ]),
    );
    await runOnce(pid);
    return { pid, list: await listReqs(pid) };
  }

  it('a status change is not an edit; a text or priority change is', async () => {
    const { pid, list } = await setup();
    const a = await ctx
      .http()
      .patch(`/api/projects/${pid}/requirements/${list[0]!.id}`)
      .set(alice)
      .send({ status: 'needs_clarification' });
    expect(a.body).toMatchObject({
      status: 'needs_clarification',
      editedByUser: false,
    });
    const b = await ctx
      .http()
      .patch(`/api/projects/${pid}/requirements/${list[0]!.id}`)
      .set(alice)
      .send({ description: 'Changed' });
    expect(b.body).toMatchObject({
      description: 'Changed',
      editedByUser: true,
      status: 'needs_clarification',
    });
  });

  it('rejects an empty or invalid update with 400', async () => {
    const { pid, list } = await setup();
    const url = `/api/projects/${pid}/requirements/${list[0]!.id}`;
    for (const body of [{}, { status: 'approved' }, { title: '  ' }]) {
      const res = await ctx.http().patch(url).set(alice).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it("cannot touch a requirement through another project's URL", async () => {
    const { list } = await setup();
    const other = await project();
    const res = await ctx
      .http()
      .patch(`/api/projects/${other}/requirements/${list[0]!.id}`)
      .set(alice)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(404);
  });

  it('confirms several at once and ignores ids of another project', async () => {
    const { pid, list } = await setup();
    const foreign = await setup();
    const res = await ctx
      .http()
      .post(`/api/projects/${pid}/requirements/confirm`)
      .set(alice)
      .send({ ids: [list[0]!.id, foreign.list[0]!.id] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect((await listReqs(pid)).map((r) => r.status)).toEqual([
      'confirmed',
      'ai_suggested',
    ]);
    expect(
      (await listReqs(foreign.pid)).every((r) => r.status === 'ai_suggested'),
    ).toBe(true);
    const row = await ctx.db
      .select()
      .from(requirements)
      .where(eq(requirements.id, foreign.list[0]!.id));
    expect(row[0]!.status).toBe('ai_suggested');
  });
});

describe('titleKey', () => {
  it('ignores case, punctuation and spacing, and keeps non-latin letters', () => {
    expect(titleKey('Online  booking!')).toBe(titleKey('online booking'));
    expect(titleKey('Бронирование онлайн')).not.toBe('');
  });
});

describe('gaps', () => {
  it('runs the gaps step after the requirements, sends them as refs, and saves gaps linked to REQ numbers', async () => {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', ['a', 'b']);
    post.mockResolvedValue(
      aiAnswer([
        reqOut('Online booking', d.id, d.segs[0]!.id),
        reqOut('EU storage', d.id, d.segs[1]!.id),
      ]),
    );
    postGaps.mockResolvedValue(
      gapsAnswer([
        gapOut('No cancellation deadline', { requirement_refs: ['R1'] }),
        gapOut('Roles are absent', { type: 'missing_requirement' }),
        gapOut('Points at nothing real', { requirement_refs: ['R9'] }),
      ]),
    );
    const runId = await runOnce(pid);

    const sent = postGaps.mock.calls[0]!;
    expect(sent[0]).toBe('/v1/analysis/gaps');
    expect(sent[1].requirements).toEqual([
      expect.objectContaining({ ref: 'R1', title: 'Online booking' }),
      expect.objectContaining({ ref: 'R2', title: 'EU storage' }),
    ]);
    expect(sent[1].documents[0].id).toBe(d.id);

    const list = await listGaps(pid);
    expect(list.map((g) => [g.number, g.text, g.requirementNumbers])).toEqual([
      [1, 'No cancellation deadline', [1]],
      [2, 'Roles are absent', []],
      [3, 'Points at nothing real', []],
    ]);
    const [run] = await ctx.db
      .select()
      .from(analysisRuns)
      .where(eq(analysisRuns.id, runId));
    expect(run).toMatchObject({
      status: 'succeeded',
      gapsFound: 3,
      step: null,
    });
  });

  it('saves nothing when the gaps step fails, and says which step failed to answer', async () => {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', ['a']);
    post.mockResolvedValue(
      aiAnswer([reqOut('Online booking', d.id, d.segs[0]!.id)]),
    );
    postGaps.mockRejectedValue(
      new HttpException({ code: 'ANALYSIS_TOO_LARGE' }, 413),
    );
    const runId = await runOnce(pid);
    const [run] = await ctx.db
      .select()
      .from(analysisRuns)
      .where(eq(analysisRuns.id, runId));
    expect(run).toMatchObject({
      status: 'failed',
      errorCode: 'ANALYSIS_TOO_LARGE',
      step: null,
    });
    expect(await listReqs(pid)).toEqual([]);
    expect(await listGaps(pid)).toEqual([]);
  });

  it('does not call the gaps step for a run cancelled during the requirements step', async () => {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', ['a']);
    let finishAi!: (v: RequirementsResponse) => void;
    post.mockReturnValue(
      new Promise<RequirementsResponse>((r) => (finishAi = r)),
    );
    const started = await ctx
      .http()
      .post(`/api/projects/${pid}/analysis`)
      .set(alice);
    const running = runner.execute(started.body.id, 'job-1');
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    await ctx
      .http()
      .post(`/api/projects/${pid}/analysis/cancel`)
      .set(alice)
      .expect(200);
    finishAi(aiAnswer([reqOut('Late', d.id, d.segs[0]!.id)]));
    await running;
    expect(postGaps).not.toHaveBeenCalled();
    expect(await listGaps(pid)).toEqual([]);
  });

  it('re-run keeps resolved and dismissed gaps with their notes, replaces open ones, never reuses numbers', async () => {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', ['a']);
    post.mockResolvedValue(
      aiAnswer([reqOut('Online booking', d.id, d.segs[0]!.id)]),
    );
    postGaps.mockResolvedValue(
      gapsAnswer([
        gapOut('Deadline missing'),
        gapOut('Roles absent'),
        gapOut('Backups absent'),
      ]),
    );
    await runOnce(pid);
    const [g1, g2] = await listGaps(pid);
    const resolved = await ctx
      .http()
      .patch(`/api/projects/${pid}/gaps/${g1!.id}`)
      .set(alice)
      .send({ status: 'resolved', note: 'Clarified: 24 hours' });
    expect(resolved.body).toMatchObject({
      status: 'resolved',
      note: 'Clarified: 24 hours',
    });
    await ctx
      .http()
      .patch(`/api/projects/${pid}/gaps/${g2!.id}`)
      .set(alice)
      .send({ status: 'dismissed', note: 'Out of scope' })
      .expect(200);

    postGaps.mockResolvedValue(
      gapsAnswer([
        gapOut('deadline  missing!'),
        gapOut('Backups absent'),
        gapOut('Brand new gap'),
      ]),
    );
    await runOnce(pid);
    const after = await listGaps(pid);
    expect(after.map((g) => [g.number, g.text, g.status, g.note])).toEqual([
      [1, 'Deadline missing', 'resolved', 'Clarified: 24 hours'],
      [2, 'Roles absent', 'dismissed', 'Out of scope'],
      [4, 'Backups absent', 'open', ''],
      [5, 'Brand new gap', 'open', ''],
    ]);
  });

  it('reopening a gap clears its note; only members of the project can read or change gaps', async () => {
    const pid = await project();
    const d = await doc(pid, 'spec.pdf', ['a']);
    post.mockResolvedValue(
      aiAnswer([reqOut('Online booking', d.id, d.segs[0]!.id)]),
    );
    postGaps.mockResolvedValue(gapsAnswer([gapOut('Deadline missing')]));
    await runOnce(pid);
    const [g] = await listGaps(pid);
    await ctx
      .http()
      .patch(`/api/projects/${pid}/gaps/${g!.id}`)
      .set(alice)
      .send({ status: 'dismissed', note: 'x' });
    const reopened = await ctx
      .http()
      .patch(`/api/projects/${pid}/gaps/${g!.id}`)
      .set(alice)
      .send({ status: 'open', note: 'ignored' });
    expect(reopened.body).toMatchObject({ status: 'open', note: '' });

    expect(
      (await ctx.http().get(`/api/projects/${pid}/gaps`).set(bob)).status,
    ).toBe(404);
    expect(
      (
        await ctx
          .http()
          .patch(`/api/projects/${pid}/gaps/${g!.id}`)
          .set(bob)
          .send({ status: 'resolved' })
      ).status,
    ).toBe(404);
    expect(
      (
        await ctx
          .http()
          .patch(`/api/projects/${pid}/gaps/${g!.id}`)
          .set(alice)
          .send({ status: 'bogus' })
      ).status,
    ).toBe(400);
  });

  it('maps the too-large answer of the AI service to its own run error', () => {
    expect(
      failureCode(new HttpException({ code: 'ANALYSIS_TOO_LARGE' }, 413)),
    ).toBe('ANALYSIS_TOO_LARGE');
  });
});
