import { pino } from 'pino';
import { LOG_REDACT } from './log-redact.js';

it('redacts credentials from logged request headers', () => {
  const lines: string[] = [];
  const logger = pino(
    { redact: LOG_REDACT },
    { write: (l: string) => lines.push(l) },
  );
  logger.info({
    req: {
      headers: {
        authorization: 'Bearer SECRET-JWT',
        cookie: 'sid=SECRET-COOKIE',
        'x-internal-token': 'SECRET-TOKEN',
        'x-request-id': 'keep-me',
      },
    },
    res: { headers: { 'set-cookie': 'sid=SECRET-SET' } },
  });
  const out = lines.join('');
  expect(out).not.toMatch(/SECRET/);
  expect(out).toContain('keep-me');
});
