import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import type { Database } from '../db/db.js';
import * as schema from '../db/schema.js';

/**
 * An in-process real Postgres (PGlite) with the project's actual migrations applied, so tests run
 * real SQL (joins, FKs, ON CONFLICT, transactions) without touching Supabase.
 */
export async function createTestDb() {
  const client = new PGlite();
  // profiles.id references Supabase's auth.users; a stub table is enough for the foreign key.
  await client.exec(
    'create schema auth; create table auth.users (id uuid primary key);',
  );
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, '../../drizzle'),
  });
  return {
    // PGlite and postgres-js share the same query builder API; only the driver differs.
    db: db as unknown as Database,
    /** Registers a Supabase user (the FK target) so a profile can be created for it. */
    addAuthUser: (id: string) =>
      client.query('insert into auth.users (id) values ($1)', [id]),
    close: () => client.close(),
  };
}
