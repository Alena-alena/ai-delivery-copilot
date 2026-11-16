import { documentErrorMessage, isDocumentErrorCode } from '@copilot/contracts';
import { ApiError } from '@/lib/api';

/** What to tell the user when an upload fails: the document-specific reason when there is one, otherwise the truth. */
export function uploadErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Upload failed';
  if (isDocumentErrorCode(error.body.code)) return documentErrorMessage(error.body.code);
  if (error.status === 401) return 'Your session has expired. Sign in again.';
  return error.body.message || 'Upload failed';
}
