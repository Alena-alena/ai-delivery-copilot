import {
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import {
  AuthUnavailableError,
  InvalidTokenError,
  type JwtVerifier,
} from './jwt-verifier.js';
import { Public } from './public.decorator.js';
import type { UsersService } from './users.service.js';

class Open {
  @Public()
  handler() {}
}
class Closed {
  handler() {}
}

function ctx(
  cls: new () => { handler(): void },
  headers: Record<string, string> = {},
) {
  const req: Record<string, unknown> = { headers };
  const context = {
    getHandler: () => cls.prototype.handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

function setup(verify = vi.fn()) {
  const ensureUser = vi.fn();
  const guard = new AuthGuard(
    new Reflector(),
    { verify } as unknown as JwtVerifier,
    { ensureUser } as unknown as UsersService,
  );
  return { guard, verify, ensureUser };
}

describe('AuthGuard', () => {
  it('lets @Public routes through without a token', async () => {
    const { guard, verify } = setup();
    await expect(guard.canActivate(ctx(Open).context)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed Authorization header', async () => {
    const { guard } = setup();
    const cases: Record<string, string>[] = [
      {},
      { authorization: 'Basic abc' },
      { authorization: 'Bearer' },
    ];
    for (const headers of cases) {
      await expect(
        guard.canActivate(ctx(Closed, headers).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('rejects an invalid token with 401', async () => {
    const { guard, ensureUser } = setup(
      vi
        .fn()
        .mockRejectedValue(new InvalidTokenError('Invalid or expired token')),
    );
    await expect(
      guard.canActivate(ctx(Closed, { authorization: 'Bearer bad' }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ensureUser).not.toHaveBeenCalled();
  });

  it('sets the verified user and provisions it', async () => {
    const user = { id: 'u1', email: 'a@b.co' };
    const { guard, verify, ensureUser } = setup(
      vi.fn().mockResolvedValue(user),
    );
    const { context, req } = ctx(Closed, { authorization: 'Bearer good' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('good');
    expect(req.user).toEqual(user);
    expect(ensureUser).toHaveBeenCalledWith(user);
  });

  it('answers 503 (not 401) when tokens cannot be verified right now', async () => {
    const { guard, ensureUser } = setup(
      vi.fn().mockRejectedValue(new AuthUnavailableError('down')),
    );
    const error = await guard
      .canActivate(ctx(Closed, { authorization: 'Bearer x' }).context)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'AUTH_UNAVAILABLE',
    });
    expect(ensureUser).not.toHaveBeenCalled();
  });

  it('does not turn unexpected errors into 401', async () => {
    const boom = new Error('jwks fetch failed');
    const { guard } = setup(vi.fn().mockRejectedValue(boom));
    await expect(
      guard.canActivate(ctx(Closed, { authorization: 'Bearer x' }).context),
    ).rejects.toBe(boom);
  });
});
