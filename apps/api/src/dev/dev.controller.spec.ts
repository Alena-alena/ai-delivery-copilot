import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import { DevController } from './dev.controller.js';
import { DevOnlyGuard } from './dev-only.guard.js';

describe('DevOnlyGuard', () => {
  const guard = (env: string) => new DevOnlyGuard({ get: () => env } as never);
  it('allows development', () =>
    expect(guard('development').canActivate()).toBe(true));
  it.each(['production', 'test'])('hides the endpoint in %s', (env) => {
    expect(() => guard(env).canActivate()).toThrow(NotFoundException);
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
    );
  });
});
