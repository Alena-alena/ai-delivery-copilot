import { isRetryableDocumentError } from '@copilot/contracts';
import { describe, expect, it } from 'vitest';

describe('isRetryableDocumentError', () => {
  it('allows another attempt for failures that can be temporary', () => {
    expect(isRetryableDocumentError('EXTRACTION_FAILED')).toBe(true);
    expect(isRetryableDocumentError('EXTRACTION_TIMEOUT')).toBe(true);
    expect(isRetryableDocumentError(null)).toBe(true);
  });

  it('does not offer it when the file itself is the problem', () => {
    for (const code of ['PDF_NO_TEXT_LAYER', 'PDF_ENCRYPTED', 'FILE_CORRUPTED', 'EMPTY_DOCUMENT']) {
      expect(isRetryableDocumentError(code)).toBe(false);
    }
  });
});
