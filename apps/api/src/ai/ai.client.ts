import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

@Injectable()
export class AiClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** GET against the internal Python service; forwards the request id, enforces a timeout. */
  async get<T>(path: string, requestId: string): Promise<T> {
    const baseUrl = this.config.get('AI_SERVICE_URL', { infer: true });
    const timeoutMs = this.config.get('AI_TIMEOUT_MS', { infer: true });
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        headers: {
          'x-internal-token': this.config.get('AI_INTERNAL_TOKEN', {
            infer: true,
          }),
          'x-request-id': requestId,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
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
    if (!res.ok) {
      throw new BadGatewayException({
        code: 'AI_ERROR',
        message: `AI service responded with ${res.status}`,
      });
    }
    return (await res.json()) as T;
  }
}
