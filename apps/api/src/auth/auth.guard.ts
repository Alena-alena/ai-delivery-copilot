import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { AuthedRequest } from './auth.types.js';
import { InvalidTokenError, JwtVerifier } from './jwt-verifier.js';
import { UsersService } from './users.service.js';

/** Global guard: every route needs a valid Supabase access token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const match = header ? /^Bearer (\S+)$/i.exec(header) : null;
    if (!match) throw new UnauthorizedException('Missing bearer token');

    try {
      req.user = await this.verifier.verify(match[1]!);
    } catch (e) {
      if (e instanceof InvalidTokenError) {
        throw new UnauthorizedException(e.message);
      }
      throw e;
    }
    await this.users.ensureUser(req.user);
    return true;
  }
}
