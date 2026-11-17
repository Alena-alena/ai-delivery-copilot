import { ConfigService } from '@nestjs/config';
import {
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { as, createTestApp } from '../testing/test-app.js';
import { LitellmUsageClient } from './litellm-usage.client.js';
import { UsageController } from './usage.controller.js';
import { UsageService, rangeStart } from './usage.service.js';

const config = (values: Record<string, unknown>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService<never, true>;

const START = Date.now(); // one clock reading, so the latency below is exactly 2500 ms
const RAW = {
  request_id: 'chatcmpl-1',
  startTime: new Date(START).toISOString(),
  endTime: new Date(START + 2500).toISOString(),
  model: 'openai/gpt-5.6-luna',
  spend: 0.0112,
  prompt_tokens: 1000,
  completion_tokens: 200,
  // fields that must never reach the browser
  api_key: 'hashed-key-secret',
  requester_ip_address: '10.1.2.3',
  messages: { secret: 'prompt text' },
  metadata: {
    user_api_key_alias: 'ai-service',
    spend_logs_metadata: {
      operation: 'analysis.requirements',
      request_id: 'req-1',
    },
  },
};

function stubFetch(handler: (url: string) => unknown, ok = true, status = 200) {
  const fn = vi.fn((url: string) =>
    Promise.resolve({ ok, status, json: () => Promise.resolve(handler(url)) }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe('LitellmUsageClient', () => {
  const client = (extra: Record<string, unknown> = {}) =>
    new LitellmUsageClient(
      config({
        LITELLM_URL: 'http://litellm:4000',
        LITELLM_MASTER_KEY: 'master',
        LITELLM_VIRTUAL_KEY: 'sk-virtual',
        ...extra,
      }),
    );

  it('maps a spend row to a call and drops everything private', async () => {
    const fetchFn = stubFetch(() => [RAW]);
    const { calls } = await client().calls(new Date(Date.now() - 3600_000));
    expect(calls).toEqual([
      {
        id: 'chatcmpl-1',
        time: RAW.startTime,
        operation: 'analysis.requirements',
        model: 'gpt-5.6-luna',
        promptTokens: 1000,
        completionTokens: 200,
        costUsd: 0.0112,
        latencyMs: 2500,
        requestId: 'req-1',
      },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(
      /hashed-key|10\.1\.2\.3|prompt text/,
    );
    expect(fetchFn.mock.calls[0]![0]).toContain(
      'http://litellm:4000/spend/logs',
    );
  });

  it('keeps the newest rows first and skips rows it does not understand', async () => {
    stubFetch(() => [
      {
        ...RAW,
        request_id: 'old',
        startTime: new Date(Date.now() - 600_000).toISOString(),
      },
      { nonsense: true },
      RAW,
    ]);
    const { calls } = await client().calls(new Date(Date.now() - 3600_000));
    expect(calls.map((c) => c.id)).toEqual(['chatcmpl-1', 'old']);
  });

  it('answers 503 USAGE_UNAVAILABLE when LiteLLM is not configured, down or erroring', async () => {
    await expect(
      client({ LITELLM_MASTER_KEY: undefined }).calls(new Date()),
    ).rejects.toMatchObject({ response: { code: 'USAGE_UNAVAILABLE' } });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    await expect(client().calls(new Date())).rejects.toMatchObject({
      response: { code: 'USAGE_UNAVAILABLE' },
    });

    stubFetch(() => ({}), false, 500);
    await expect(client().calls(new Date())).rejects.toMatchObject({
      response: { code: 'USAGE_UNAVAILABLE' },
    });
  });

  it('reads the budget, and returns null instead of failing when it cannot', async () => {
    stubFetch(() => ({ info: { max_budget: 5 } }));
    expect(await client().budgetUsd()).toBe(5);
    stubFetch(() => ({}), false, 404);
    expect(await client().budgetUsd()).toBeNull();
    expect(
      await client({ LITELLM_VIRTUAL_KEY: undefined }).budgetUsd(),
    ).toBeNull();
  });
});

describe('rangeStart', () => {
  const now = new Date('2026-11-17T15:30:00Z');
  it('computes the window start', () => {
    expect(rangeStart('today', now).toISOString()).toBe(
      '2026-11-17T00:00:00.000Z',
    );
    expect(rangeStart('7d', now).toISOString()).toBe(
      '2026-11-10T15:30:00.000Z',
    );
    expect(rangeStart('30d', now).toISOString()).toBe(
      '2026-10-18T15:30:00.000Z',
    );
  });
});

describe('GET /api/usage', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const calls = vi.fn();
  beforeAll(async () => {
    ctx = await createTestApp({
      controllers: [UsageController],
      providers: [
        UsageService,
        {
          provide: LitellmUsageClient,
          useValue: { calls, budgetUsd: () => Promise.resolve(5) },
        },
      ],
    });
  });
  afterAll(() => ctx.close());

  const call = (id: string, cost: number, requestId: string | null) => ({
    id,
    time: '2026-11-17T10:00:00.000Z',
    operation: 'x',
    model: 'gpt-5.6-luna',
    promptTokens: 100,
    completionTokens: 20,
    costUsd: cost,
    latencyMs: 1000,
    requestId,
  });

  it('needs a signed-in user', async () => {
    expect((await ctx.http().get('/api/usage')).status).toBe(401);
  });

  it('returns the calls with totals, requests counted once per request id', async () => {
    calls.mockResolvedValue({
      calls: [
        call('a', 0.01, 'r1'),
        call('b', 0.02, 'r1'),
        call('c', 0.03, null),
      ],
      truncated: false,
    });
    const res = await ctx
      .http()
      .get('/api/usage?range=7d')
      .set(as('token-alice'));
    expect(res.status).toBe(200);
    expect(res.body.range).toBe('7d');
    expect(res.body.budgetUsd).toBe(5);
    expect(res.body.totals).toEqual({
      costUsd: 0.06,
      calls: 3,
      requests: 2,
      tokens: 360,
    });
  });

  it('defaults to 30 days and rejects an unknown range with 400', async () => {
    calls.mockResolvedValue({ calls: [], truncated: false });
    const ok = await ctx.http().get('/api/usage').set(as('token-alice'));
    expect(ok.body.range).toBe('30d');
    const bad = await ctx
      .http()
      .get('/api/usage?range=year')
      .set(as('token-alice'));
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });
});
