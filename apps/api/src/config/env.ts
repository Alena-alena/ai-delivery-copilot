import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  AI_SERVICE_URL: z.url().default('http://localhost:8000'),
  AI_INTERNAL_TOKEN: z.string().min(16),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Supabase Postgres. DATABASE_URL: transaction pooler (6543) used by the app.
  // DATABASE_MIGRATION_URL: session pooler (5432), used by drizzle-kit and the job queue (pg-boss),
  // both of which need a real session and not the transaction pooler.
  DATABASE_URL: z.string().startsWith('postgres'),
  DATABASE_MIGRATION_URL: z.string().startsWith('postgres'),
  // All extracted documents of one project may hold at most this many tokens (cost and context budget).
  PROJECT_TEXT_TOKEN_LIMIT: z.coerce.number().int().positive().default(150_000),
  // Where uploaded files are stored (a folder; mount a volume here in deployment).
  STORAGE_DIR: z.string().min(1).default('./storage'),
  // Supabase project URL (public). Tokens are verified against its JWKS, no shared secret needed.
  SUPABASE_URL: z.url(),
  // Fail closed: dev-only endpoints exist only when explicitly enabled (never implied by NODE_ENV).
  ENABLE_DEV_ENDPOINTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return result.data;
}
