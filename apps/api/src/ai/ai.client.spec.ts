import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { afterEach, vi } from 'vitest';
import { AiClient } from './ai.client.js';

const config = {
  get: (k: string) =>
    ({
      AI_SERVICE_URL: 'http://ai.test',
      AI_INTERNAL_TOKEN: 'tok',
      AI_TIMEOUT_MS: 50,
    })[k],
} as never;

afterEach(() => vi.unstubAllGlobals());

describe('AiClient', () => {
  it('forwards token and request id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"status":"ok"}'));
    vi.stubGlobal('fetch', fetchMock);
    await new AiClient(config).get('/v1/ping', 'rid-1');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-internal-token': 'tok',
      'x-request-id': 'rid-1',
    });
  });

  it('maps timeouts to 504', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError')),
    );
    await expect(new AiClient(config).get('/x', 'r')).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  });

  it('maps non-2xx to 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('no', { status: 401 })),
    );
    await expect(new AiClient(config).get('/x', 'r')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});

describe('AiClient errors from Python', () => {
  it('passes through 429 with the upstream code', async () => {
    const body = JSON.stringify({
      code: 'LLM_RATE_LIMITED',
      message: 'slow down',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(body, { status: 429 })),
    );
    await expect(
      new AiClient(config).post('/x', {}, 'r'),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'LLM_RATE_LIMITED' },
    });
  });
});
