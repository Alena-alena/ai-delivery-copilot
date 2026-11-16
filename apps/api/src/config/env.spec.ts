import { validateEnv } from './env.js';

const base = { AI_INTERNAL_TOKEN: 'x'.repeat(16) };

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv(base)).toMatchObject({
      PORT: 3000,
      NODE_ENV: 'development',
    });
  });
  it('rejects an invalid port', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(
      /Invalid environment/,
    );
  });
  it('requires the internal AI token', () => {
    expect(() => validateEnv({})).toThrow(/AI_INTERNAL_TOKEN/);
  });
});
