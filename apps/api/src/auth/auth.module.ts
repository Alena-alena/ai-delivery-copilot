import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createRemoteJWKSet } from 'jose';
import type { Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { JwtVerifier } from './jwt-verifier.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    UsersService,
    {
      provide: JwtVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get('SUPABASE_URL', { infer: true });
        const jwks = createRemoteJWKSet(
          new URL(`${url.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`),
          {
            // jose's default is 5 s, and Supabase's key endpoint is sometimes slower than that
            // (seen at 5.4 s), which showed up as sporadic 503s.
            timeoutDuration: 15_000,
          },
        );
        // Fetch the keys now, in the background, so the first real request does not pay for it.
        jwks.reload().catch((err: unknown) => {
          new Logger('AuthModule').warn(
            `Could not pre-load the Supabase signing keys (they are fetched on demand): ${String(err)}`,
          );
        });
        return new JwtVerifier(jwks, url);
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
