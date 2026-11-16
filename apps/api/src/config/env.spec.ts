import { validateEnv } from './env.js';

const base = {
  AI_INTERNAL_TOKEN: 'x'.repeat(16),
  DATABASE_URL: 'postgresql://u:p@localhost:6543/postgres',
  DATABASE_MIGRATION_URL: 'postgresql://u:p@localhost:5432/postgres',
  SUPABASE_URL: 'https://abc.supabase.co',
};

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
  it('requires the database and Supabase URLs', () => {
    expect(() =>
      validateEnv({ AI_INTERNAL_TOKEN: base.AI_INTERNAL_TOKEN }),
    ).toThrow(/DATABASE_URL.*SUPABASE_URL/);
  });
  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'jsdfio87' })).toThrow(
      /DATABASE_URL/,
    );
  });
});
