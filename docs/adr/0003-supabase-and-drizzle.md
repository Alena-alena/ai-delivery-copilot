# ADR 0003: Supabase (Postgres + Auth) with Drizzle

Status: accepted (phase 2). Supersedes the "own auth + plain Postgres" recommendation in Q14.

## Context

We need Postgres and user authentication. Writing our own auth (password hashing, sessions, reset) adds
security-sensitive code that is not the point of the project.

## Decision

- **Supabase** provides Postgres and Auth (users, tokens). One cloud project is used from the start; no
  local Supabase stack (Q26).
- **NestJS verifies Supabase JWTs** (signature through the project's JWKS) and is the only component that
  reads or writes application tables.
- **Drizzle** defines the schema in TypeScript and generates SQL migrations (`drizzle-kit`).
- **RLS is enabled on every table with no policies.** If the anon key leaks, direct table access still
  returns nothing.
- Two connection strings: `DATABASE_URL` (transaction pooler, port 6543, used by the app with
  `prepare: false`) and `DATABASE_MIGRATION_URL` (session pooler, port 5432, used only by `drizzle-kit`).
  The pooler hosts work over IPv4; the direct host is IPv6-only on the free plan.

## Consequences

- The frontend talks to Supabase only to sign in; all data goes through the NestJS API.
- Application data lives in `public`; `auth.users` is only referenced (`profiles.id`), never modified.
- The service-role key is never used by the app and never reaches the browser.
