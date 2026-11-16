import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

// Upstream statuses whose code/message are meaningful to our callers and are passed through.
const PASSTHROUGH_STATUSES = new Set([429, 502, 504]);

@Injectable()
export class AiClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<T>(path: string, requestId: string): Promise<T> {
    return this.request<T>('GET', path, requestId);
  }

  /** LLM-backed calls pass a longer `timeoutMs` than the default used for quick checks. */
  post<T>(
    path: string,
    body: unknown,
    requestId: string,
    timeoutMs?: number,
  ): Promise<T> {
    return this.request<T>('POST', path, requestId, body, timeoutMs);
  }

  /** Calls the internal Python service; forwards token and request id, enforces a timeout. */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    requestId: string,
    body?: unknown,
    timeoutOverrideMs?: number,
  ): Promise<T> {
    const baseUrl = this.config.get('AI_SERVICE_URL', { infer: true });
    const timeoutMs =
      timeoutOverrideMs ?? this.config.get('AI_TIMEOUT_MS', { infer: true });
    const headers: Record<string, string> = {
      'x-internal-token': this.config.get('AI_INTERNAL_TOKEN', { infer: true }),
      'x-request-id': requestId,
    };
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let res: Response;
    let text: string;
    try {
      res = await fetch(`${baseUrl}${path}`, init);
      // The timeout also covers reading the body, so it is read inside this try.
      text = await res.text();
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        throw new GatewayTimeoutException({
          code: 'AI_TIMEOUT',
          message: `AI service did not respond within ${timeoutMs} ms`,
        });
      }
      throw new BadGatewayException({
        code: 'AI_UNAVAILABLE',
        message: 'AI service unreachable',
      });
    }

    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // non-JSON body: handled below
    }

    if (!res.ok) {
      const upstream = payload as { code?: string; message?: string } | null;
      if (PASSTHROUGH_STATUSES.has(res.status) && upstream?.code) {
        throw new HttpException(
          {
            code: upstream.code,
            message: upstream.message ?? 'AI service error',
          },
          res.status,
        );
      }
      throw new BadGatewayException({
        code: 'AI_ERROR',
        message: `AI service responded with ${res.status}`,
      });
    }
    if (payload === null) {
      throw new BadGatewayException({
        code: 'AI_ERROR',
        message: 'AI service returned an invalid response',
      });
    }
    return payload as T;
  }
}
