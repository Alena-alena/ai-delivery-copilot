import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown, logger = { error: vi.fn() }) {
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnThis(), json, getHeader: vi.fn() };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1' }),
      getResponse: () => res,
    }),
  };
  new AllExceptionsFilter(logger as never).catch(exception, host as never);
  return {
    status: res.status.mock.calls[0][0],
    body: json.mock.calls[0][0],
    logger,
  };
}

describe('AllExceptionsFilter', () => {
  it('formats a standard HttpException', () => {
    const { status, body } = run(new NotFoundException());
    expect(status).toBe(404);
    expect(body).toEqual({
      code: 'NOT_FOUND',
      message: 'Not Found',
      requestId: 'req-1',
    });
  });

  it('uses a custom code and message from the response object', () => {
    const { status, body } = run(
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'bad prompt',
      }),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'bad prompt',
    });
  });

  it('passes through upstream codes such as AI_TIMEOUT / LLM_RATE_LIMITED', () => {
    const { status, body } = run(
      new HttpException({ code: 'LLM_RATE_LIMITED', message: 'slow' }, 429),
    );
    expect(status).toBe(429);
    expect(body.code).toBe('LLM_RATE_LIMITED');
  });

  it('hides internals of unexpected errors and logs them', () => {
    const { status, body, logger } = run(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'req-1',
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
