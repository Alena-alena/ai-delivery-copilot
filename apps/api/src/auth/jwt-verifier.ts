import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthUser } from './auth.types.js';

/** Supabase signs access tokens for signed-in users with `aud: "authenticated"`. */
const AUDIENCE = 'authenticated';
/** An allow-list, so `none` and symmetric (HS256) tokens are never accepted. */
const ALGORITHMS = ['ES256', 'RS256'];

export class InvalidTokenError extends Error {}

export class JwtVerifier {
  private readonly issuer: string;

  constructor(
    private readonly keys: JWTVerifyGetKey,
    supabaseUrl: string,
  ) {
    this.issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  }

  /** Verifies signature, issuer, audience and expiry; returns the user or throws InvalidTokenError. */
  async verify(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: AUDIENCE,
        algorithms: ALGORITHMS,
      });
      const email = payload['email'];
      if (!payload.sub || typeof email !== 'string' || email === '') {
        throw new InvalidTokenError('Token has no subject or email');
      }
      return { id: payload.sub, email };
    } catch (e) {
      if (e instanceof InvalidTokenError) throw e;
      throw new InvalidTokenError('Invalid or expired token');
    }
  }
}
