import { Module } from '@nestjs/common';
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
        );
        return new JwtVerifier(jwks, url);
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
