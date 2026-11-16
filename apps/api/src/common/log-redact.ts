// Never write credentials to logs (Phase 2 adds Authorization: Bearer <JWT>).
export const LOG_REDACT = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-internal-token"]',
    'res.headers["set-cookie"]',
  ],
  censor: '[redacted]',
};
