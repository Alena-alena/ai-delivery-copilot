import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { InvalidTokenError, JwtVerifier } from './jwt-verifier.js';

const URL_ = 'https://proj.supabase.co';
const ISSUER = `${URL_}/auth/v1`;

let verifier: JwtVerifier;
let privateKey: CryptoKey;

async function sign(
  claims: Record<string, unknown> = { email: 'a@b.co' },
  opts: {
    key?: CryptoKey;
    iss?: string;
    aud?: string;
    exp?: string | number;
    sub?: string;
  } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(opts.sub ?? 'user-1')
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const jwk: JWK = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'k1',
    alg: 'ES256',
  };
  verifier = new JwtVerifier(createLocalJWKSet({ keys: [jwk] }), `${URL_}/`);
});

describe('JwtVerifier', () => {
  it('accepts a valid token and returns the user from the token', async () => {
    await expect(verifier.verify(await sign())).resolves.toEqual({
      id: 'user-1',
      email: 'a@b.co',
    });
  });

  it('rejects a token signed with another key (forged)', async () => {
    const other = await generateKeyPair('ES256');
    const forged = await sign({ email: 'a@b.co' }, { key: other.privateKey });
    await expect(verifier.verify(forged)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('rejects an expired token', async () => {
    const expired = await sign(
      { email: 'a@b.co' },
      { exp: Math.floor(Date.now() / 1000) - 60 },
    );
    await expect(verifier.verify(expired)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('rejects a token from another issuer', async () => {
    const t = await sign(
      { email: 'a@b.co' },
      { iss: 'https://evil.co/auth/v1' },
    );
    await expect(verifier.verify(t)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a token for another audience (e.g. an anon key)', async () => {
    const t = await sign({ email: 'a@b.co' }, { aud: 'anon' });
    await expect(verifier.verify(t)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a token without an email', async () => {
    await expect(verifier.verify(await sign({}))).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('rejects garbage and an unsigned (alg none) token', async () => {
    await expect(verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none' })}.${b64({ sub: 'u', email: 'a@b.co', iss: ISSUER, aud: 'authenticated' })}.`;
    await expect(verifier.verify(none)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('does not leak the underlying reason', async () => {
    const t = await sign({ email: 'a@b.co' }, { aud: 'anon' });
    await expect(verifier.verify(t)).rejects.toThrow(
      'Invalid or expired token',
    );
  });
});
