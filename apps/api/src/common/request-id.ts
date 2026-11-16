import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

// A caller-supplied id is accepted only if short and plain, so it cannot bloat or forge log lines.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function resolveRequestId(header: unknown): string {
  return typeof header === 'string' && REQUEST_ID_PATTERN.test(header)
    ? header
    : randomUUID();
}

/** The id assigned by the logger middleware (always a string; '' only if middleware did not run). */
export function getRequestId(req: Pick<Request, 'id'>): string {
  const id: unknown = req.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
}
