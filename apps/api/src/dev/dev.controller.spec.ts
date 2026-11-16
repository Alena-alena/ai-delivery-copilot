import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import { DevController, LLM_TIMEOUT_MS } from './dev.controller.js';
import { DevOnlyGuard } from './dev-only.guard.js';

describe('DevOnlyGuard', () => {
  const guard = (enabled: boolean, env = 'development') =>
    new DevOnlyGuard({
      get: (k: string) => (k === 'NODE_ENV' ? env : enabled),
    } as never);
  it('allows when explicitly enabled', () =>
    expect(guard(true).canActivate()).toBe(true));
  it('is closed by default', () => {
    expect(() => guard(false).canActivate()).toThrow(NotFoundException);
  });
  it('stays closed in production even if the flag is set', () => {
    expect(() => guard(true, 'production').canActivate()).toThrow(
      NotFoundException,
    );
  });
});

describe('DevController', () => {
  it('rejects an empty prompt', () => {
    const ctrl = new DevController({ post: vi.fn() } as never);
    expect(() => ctrl.llmPing({ prompt: '' }, { id: 'r' } as never)).toThrow(
      BadRequestException,
    );
  });
  it('forwards a valid prompt with the request id', async () => {
    const post = vi.fn().mockResolvedValue({ text: 'pong' });
    const ctrl = new DevController({ post } as never);
    await ctrl.llmPing({ prompt: 'hi' }, { id: 'r-1' } as never);
    expect(post).toHaveBeenCalledWith(
      '/v1/debug/complete',
      { prompt: 'hi' },
      'r-1',
      LLM_TIMEOUT_MS,
    );
  });
});
