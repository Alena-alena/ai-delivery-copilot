import { validateEnv } from './env.js';

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv({})).toMatchObject({
      PORT: 3000,
      NODE_ENV: 'development',
    });
  });
  it('rejects an invalid port', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(/Invalid environment/);
  });
});
