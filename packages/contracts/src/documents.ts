import { z } from 'zod';

/** One upload may be at most this large. The API enforces it; the browser checks first for speed. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'txt'] as const;
export type DocumentExtension = (typeof DOCUMENT_EXTENSIONS)[number];

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** The same check runs in the browser (before uploading) and in the API (before storing). */
export const uploadFileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'The file has no name')
    .max(255, 'The file name is too long')
    .refine(
      (n) => (DOCUMENT_EXTENSIONS as readonly string[]).includes(fileExtension(n)),
      'Only PDF, DOCX and TXT files are supported',
    ),
  size: z
    .number()
    .int()
    .positive('The file is empty')
    .max(DOCUMENT_MAX_BYTES, 'The file is larger than 10 MB'),
});

export const documentStatusSchema = z.enum([
  'uploaded',
  'extracting',
  'extracted',
  'extraction_failed',
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

/** Codes in `errorCode` and in upload error responses, with what to tell the user. */
export const DOCUMENT_ERROR_MESSAGES = {
  FILE_TOO_LARGE: 'The file is larger than 10 MB. Split it or compress it.',
  UNSUPPORTED_TYPE:
    'Only PDF, DOCX and TXT files are supported, and the content must match the extension.',
  FILE_CORRUPTED:
    'The file looks damaged and cannot be read. Export it again and upload a new copy.',
  PDF_NO_TEXT_LAYER:
    'This PDF has no text layer (it is probably a scan). OCR is not supported yet; upload a text version.',
  PDF_ENCRYPTED: 'This PDF is password-protected. Remove the password and upload it again.',
  EMPTY_DOCUMENT: 'No text was found in this document.',
  PROJECT_TEXT_LIMIT:
    'Adding this document would exceed the text limit for the project. Remove another document first.',
  EXTRACTION_FAILED: 'Text extraction failed. Try again in a moment.',
} as const;
export type DocumentErrorCode = keyof typeof DOCUMENT_ERROR_MESSAGES;

export function documentErrorMessage(code: string | null | undefined): string {
  return code && code in DOCUMENT_ERROR_MESSAGES
    ? DOCUMENT_ERROR_MESSAGES[code as DocumentErrorCode]
    : DOCUMENT_ERROR_MESSAGES.EXTRACTION_FAILED;
}

export const documentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  mime: z.string(),
  size: z.number().int(),
  status: documentStatusSchema,
  errorCode: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  tokenCount: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const documentSegmentSchema = z.object({
  id: z.uuid(),
  index: z.number().int(),
  page: z.number().int().nullable(),
  text: z.string(),
  tokenCount: z.number().int(),
});

export const documentDetailSchema = documentSchema.extend({
  segments: z.array(documentSegmentSchema),
});

export type Document = z.infer<typeof documentSchema>;
export type DocumentSegment = z.infer<typeof documentSegmentSchema>;
export type DocumentDetail = z.infer<typeof documentDetailSchema>;
