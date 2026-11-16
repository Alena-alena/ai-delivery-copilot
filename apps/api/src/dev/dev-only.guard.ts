import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/** Dev endpoints answer 404 unless ENABLE_DEV_ENDPOINTS=true (default: off) and not production. */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(): boolean {
    const enabled = this.config.get('ENABLE_DEV_ENDPOINTS', { infer: true });
    if (
      !enabled ||
      this.config.get('NODE_ENV', { infer: true }) === 'production'
    ) {
      throw new NotFoundException();
    }
    return true;
  }
}
