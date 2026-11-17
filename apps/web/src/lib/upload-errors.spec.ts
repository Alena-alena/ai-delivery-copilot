import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));

import { ApiError } from './api';
import { uploadErrorMessage } from './upload-errors';

const err = (status: number, code: string, message = 'server said so') =>
  new ApiError(status, { code, message });

describe('uploadErrorMessage', () => {
  it('explains document-specific rejections in plain words', () => {
    expect(uploadErrorMessage(err(422, 'FILE_CORRUPTED'))).toMatch(/damaged/);
    expect(uploadErrorMessage(err(409, 'PROJECT_STORAGE_LIMIT'))).toMatch(/limit/);
    expect(uploadErrorMessage(err(413, 'FILE_TOO_LARGE'))).toMatch(/10 MB/);
  });

  it('shows the duplicate message from the API, which names the matching file', () => {
    const msg = 'This file is already in the project as "spec.pdf".';
    expect(uploadErrorMessage(err(409, 'DUPLICATE_DOCUMENT', msg))).toBe(msg);
  });

  it('does not call a session or network problem a text-extraction failure', () => {
    expect(uploadErrorMessage(err(401, 'UNAUTHORIZED'))).toMatch(/session has expired/);
    expect(uploadErrorMessage(err(0, 'NETWORK_ERROR', 'Network error during upload'))).toBe(
      'Network error during upload',
    );
    const message = uploadErrorMessage(
      err(503, 'AUTH_UNAVAILABLE', 'Could not verify the token right now'),
    );
    expect(message).toBe('Could not verify the token right now');
    expect(message).not.toMatch(/extraction/i);
  });

  it('falls back to a generic message for anything that is not an API error', () => {
    expect(uploadErrorMessage(new Error('boom'))).toBe('Upload failed');
  });
});
