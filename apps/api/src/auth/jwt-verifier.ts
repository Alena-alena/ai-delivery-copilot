import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthUser } from './auth.types.js';

/** Supabase signs access tokens for signed-in users with `aud: "authenticated"`. */
const AUDIENCE = 'authenticated';
/** An allow-list, so `none` and symmetric (HS256) tokens are never accepted. */
const ALGORITHMS = ['ES256', 'RS256'];

export class InvalidTokenError extends Error {}
/** The token could not be checked right now (e.g. the key set cannot be fetched). Not the user's fault. */
export class AuthUnavailableError extends Error {}

/** Errors that mean "this token is bad". Anything else (network, key-set fetch) is an outage. */
const BAD_TOKEN_ERRORS = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWSSignatureVerificationFailed,
  errors.JWSInvalid,
  errors.JWTInvalid,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

export class JwtVerifier {
  private readonly issuer: string;

  constructor(
    private readonly keys: JWTVerifyGetKey,
    supabaseUrl: string,
  ) {
    this.issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  }

  /**
   * Verifies signature, issuer, audience and expiry; returns the user. Throws InvalidTokenError for a bad
   * token and AuthUnavailableError when verification itself failed (so an outage is not a mass sign-out).
   */
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
      if (BAD_TOKEN_ERRORS.some((c) => e instanceof c)) {
        throw new InvalidTokenError('Invalid or expired token');
      }
      throw new AuthUnavailableError('Could not verify the token right now');
    }
  }
}
