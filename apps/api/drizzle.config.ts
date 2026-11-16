import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('../../.env');
} catch {
  // no .env (CI): rely on the real environment
}

// Migrations use DATABASE_MIGRATION_URL: Supabase's session pooler (port 5432, IPv4-friendly).
// The app itself uses DATABASE_URL (transaction pooler, port 6543).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['public'],
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL ?? '' },
});
