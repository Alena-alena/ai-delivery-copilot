import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { DOCUMENT_ERROR_MESSAGES } from '@copilot/contracts';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { getRequestId } from './request-id.js';

export interface ErrorBody {
  code: string;
  message: string;
  requestId: string;
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = getRequestId(req);

    let message = 'Internal server error';
    let code =
      STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
    if (exception instanceof PayloadTooLargeException) {
      // thrown by the upload interceptor when a file exceeds the size limit
      code = 'FILE_TOO_LARGE';
      message = DOCUMENT_ERROR_MESSAGES.FILE_TOO_LARGE;
    } else if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as { message?: string | string[]; code?: string };
        if (r.code) code = r.code;
        if (r.message)
          message = Array.isArray(r.message) ? r.message.join('; ') : r.message;
      }
    }

    if (status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    }

    const body: ErrorBody = { code, message, requestId };
    res.status(status).json(body);
  }
}
