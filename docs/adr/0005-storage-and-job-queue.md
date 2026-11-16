# ADR 0005: Storage behind an interface, jobs on pg-boss

Status: accepted (phase 3). Answers Q17 (queue) and Q27 (where files live).

## Context

Uploaded files must be stored, and extracting their text takes seconds to minutes: too long for an HTTP
request, and it must survive an API restart.

## Decision

- **Files:** business code depends on the abstract `StorageService` (put, get, delete). In development the
  implementation is `LocalStorageService` on a folder (`STORAGE_DIR`, a Docker volume when deployed). Keys are
  `workspaces/{wid}/projects/{pid}/documents/{docId}/original.{ext}`, built from our own ids and an allow-listed
  extension, and the local store refuses any key that resolves outside its root.
  Moving to Supabase Storage means one new class and one provider binding in `StorageModule`.
- **Queue:** pg-boss, in the same Postgres (schema `pgboss`). Jobs survive a restart and no Redis is needed.
  pg-boss needs a real session, so it connects with `DATABASE_MIGRATION_URL` (the session pooler), not the
  transaction pooler used by the app.
- **Extraction job (`document.extract`):** idempotent. Segments are replaced in one transaction and a document
  that is already extracted is skipped, so a re-delivered job is harmless. Only temporary failures (timeouts,
  429, 502/504, a missing file) are retried (3 times, with backoff); a document that can never be read is
  marked failed with a typed code and the job completes.
- **Python stays stateless:** NestJS sends the bytes, Python returns segments, NestJS writes them.

## Consequences

- Upload validates by content (magic bytes), so the extension cannot lie; limits are enforced twice (NestJS 10 MB,
  Python 11 MB, and Python stops reading a body as soon as it passes its limit).
- Each project is capped at `PROJECT_MAX_DOCUMENTS` files (50) and `PROJECT_MAX_STORAGE_MB` (200) in total; failed and
  unreadable files count too. The check and the insert run under a per-project advisory lock, so simultaneous
  uploads cannot both slip under the cap.
- Extraction is bounded: at most 300 PDF pages, three files parsed at once, and a 45 s work budget inside Python
  (below Nest's 60 s timeout). A worker thread cannot be cancelled from outside, so it stops itself and answers
  with a final `EXTRACTION_TIMEOUT`, which the queue does not retry.
- Token verification distinguishes a bad token (401) from an auth outage such as an unreachable key set (503), so
  a Supabase blip does not sign everyone out.
- If queuing fails right after an upload the document is marked failed (retryable) rather than stuck.
- The text limit per project (`PROJECT_TEXT_TOKEN_LIMIT`, default 150k tokens) is checked inside the save
  transaction under a per-project advisory lock.
- Not solved yet: orphaned files if the process dies between storing a file and recording it. Acceptable for the
  MVP; a periodic sweep can remove them later.
