import { HttpException } from '@nestjs/common';
import {
  DOCUMENT_ERROR_MESSAGES,
  DOCUMENT_MAX_BYTES,
  fileExtension,
  type DocumentErrorCode,
  type DocumentExtension,
  DOCUMENT_EXTENSIONS,
} from '@copilot/contracts';
import { unzipSync } from 'fflate';
import { fileTypeFromBuffer } from 'file-type';

export interface DetectedDocument {
  ext: DocumentExtension;
  /** Canonical type decided from the content; the browser's Content-Type header is ignored. */
  mime: string;
}

const MIME: Record<DocumentExtension, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

const STATUS: Partial<Record<DocumentErrorCode, number>> = {
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_TYPE: 415,
  FILE_CORRUPTED: 422,
  PROJECT_STORAGE_LIMIT: 409,
};

export function rejectDocument(code: DocumentErrorCode): never {
  throw new HttpException(
    { code, message: DOCUMENT_ERROR_MESSAGES[code] },
    STATUS[code] ?? 422,
  );
}

/** A zip entry larger than this is treated as a zip bomb and the file as unreadable. */
const MAX_UNZIPPED_ENTRY = 50 * 1024 * 1024;

function docxHasBody(data: Buffer): boolean {
  try {
    const entries = unzipSync(new Uint8Array(data), {
      filter: (f) =>
        f.name === 'word/document.xml' && f.originalSize <= MAX_UNZIPPED_ENTRY,
    });
    return 'word/document.xml' in entries;
  } catch {
    return false;
  }
}

/**
 * Decides what a file really is from its bytes. The extension must match the content, so an .exe
 * renamed to .pdf is rejected as UNSUPPORTED_TYPE, and a file with a PDF/DOCX header but a broken
 * structure is rejected as FILE_CORRUPTED.
 */
export async function detectDocument(
  name: string,
  data: Buffer,
): Promise<DetectedDocument> {
  const ext = fileExtension(name);
  if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    rejectDocument('UNSUPPORTED_TYPE');
  }
  if (data.length === 0) rejectDocument('FILE_CORRUPTED');
  if (data.length > DOCUMENT_MAX_BYTES) rejectDocument('FILE_TOO_LARGE');

  const sniffed = await fileTypeFromBuffer(data);

  switch (ext as DocumentExtension) {
    case 'pdf': {
      if (sniffed?.mime !== 'application/pdf')
        rejectDocument('UNSUPPORTED_TYPE');
      // A complete PDF ends with %%EOF (some tools append a little padding after it).
      if (!data.subarray(-1024).includes('%%EOF'))
        rejectDocument('FILE_CORRUPTED');
      return { ext: 'pdf', mime: MIME.pdf };
    }
    case 'docx': {
      // A DOCX is a zip. Not a zip at all: wrong type. A zip without a Word body: damaged.
      if (!data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        rejectDocument('UNSUPPORTED_TYPE');
      }
      if (!docxHasBody(data)) rejectDocument('FILE_CORRUPTED');
      return { ext: 'docx', mime: MIME.docx };
    }
    case 'txt': {
      // Plain text has no magic bytes: it must not look like any known binary format or contain NULs.
      // UTF-16 (Windows "Unicode" text) legitimately contains NULs, so a UTF-16 byte-order mark is allowed.
      const utf16Bom =
        (data[0] === 0xff && data[1] === 0xfe) ||
        (data[0] === 0xfe && data[1] === 0xff);
      if (sniffed || (!utf16Bom && data.subarray(0, 8000).includes(0))) {
        rejectDocument('UNSUPPORTED_TYPE');
      }
      return { ext: 'txt', mime: MIME.txt };
    }
  }
}

/** The name shown to users: no path, no control characters, at most 255 characters. */
export function safeFileName(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/\p{Cc}/gu, '').trim();
  return cleaned.slice(-255) || 'document';
}
