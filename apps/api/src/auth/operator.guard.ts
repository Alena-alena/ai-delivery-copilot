import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import type { AuthedRequest } from './auth.types.js';

/** True when the email is in USAGE_ADMIN_EMAILS (case-insensitive). An empty list means nobody: fail closed. */
export function isOperator(
  config: ConfigService<Env, true>,
  email: string | undefined,
): boolean {
  if (!email) return false;
  const list = config.get('USAGE_ADMIN_EMAILS', { infer: true });
  return Array.isArray(list) && list.includes(email.trim().toLowerCase());
}

/** For routes that show data across all users. Runs after the global AuthGuard, which sets request.user. */
@Injectable()
export class OperatorGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!isOperator(this.config, user?.email)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'This page is only for operators',
      });
    }
    return true;
  }
}
