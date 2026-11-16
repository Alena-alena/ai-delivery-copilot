import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>['db'];

/** Server-side connection (Supabase pooler or direct). Never exposed to the browser. */
export function createDatabase(url: string) {
  // prepare: false is required for Supabase's transaction pooler (pgbouncer).
  const client = postgres(url, { prepare: false, max: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
