import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/** Dev endpoints answer 404 everywhere except NODE_ENV=development. */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(): boolean {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'development') {
      throw new NotFoundException();
    }
    return true;
  }
}
