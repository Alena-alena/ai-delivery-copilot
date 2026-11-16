import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  AI_SERVICE_URL: z.url().default('http://localhost:8000'),
  AI_INTERNAL_TOKEN: z.string().min(16),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
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
