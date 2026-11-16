import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthedRequest, AuthUser } from './auth.types.js';

/** The verified user. Never read a user id from the body, query or params. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new UnauthorizedException('Not authenticated');
    return user;
  },
);
