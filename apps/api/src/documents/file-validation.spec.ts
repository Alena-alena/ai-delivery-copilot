import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectDocument, safeFileName } from './file-validation.js';

const sample = (name: string) =>
  readFileSync(path.resolve(import.meta.dirname, '../../../../samples', name));

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return (e as { getResponse(): { code: string } }).getResponse().code;
  }
  return undefined;
}

describe('detectDocument (the real files in samples/)', () => {
  it.each([
    ['01_clinicbook_requirements_en.pdf', 'pdf', 'application/pdf'],
    ['05_scanned_addendum_no_text.pdf', 'pdf', 'application/pdf'],
    ['02_meeting_notes_en.docx', 'docx', undefined],
    ['03_client_email_ru_cp1251.txt', 'txt', 'text/plain'],
    ['04_vendor_notes_with_injection.txt', 'txt', 'text/plain'],
  ])('accepts %s', async (file, ext, mime) => {
    const detected = await detectDocument(file, sample(file));
    expect(detected.ext).toBe(ext);
    if (mime) expect(detected.mime).toBe(mime);
  });

  it('rejects an executable renamed to .pdf as UNSUPPORTED_TYPE (magic bytes)', async () => {
    expect(
      await codeOf(
        detectDocument(
          '07_fake_extension.pdf',
          sample('07_fake_extension.pdf'),
        ),
      ),
    ).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects a PDF with a valid header but a damaged body as FILE_CORRUPTED', async () => {
    expect(
      await codeOf(
        detectDocument('06_corrupted.pdf', sample('06_corrupted.pdf')),
      ),
    ).toBe('FILE_CORRUPTED');
  });
});

describe('detectDocument (edge cases)', () => {
  it('rejects unknown extensions', async () => {
    expect(await codeOf(detectDocument('photo.png', Buffer.from('x')))).toBe(
      'UNSUPPORTED_TYPE',
    );
    expect(await codeOf(detectDocument('noextension', Buffer.from('x')))).toBe(
      'UNSUPPORTED_TYPE',
    );
  });

  it('rejects an empty file', async () => {
    expect(await codeOf(detectDocument('a.txt', Buffer.alloc(0)))).toBe(
      'FILE_CORRUPTED',
    );
  });

  it('rejects a binary file named .txt', async () => {
    expect(
      await codeOf(detectDocument('a.txt', sample('07_fake_extension.pdf'))),
    ).toBe('UNSUPPORTED_TYPE');
    expect(
      await codeOf(detectDocument('a.txt', Buffer.from([1, 2, 0, 3]))),
    ).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects a PDF-named text file', async () => {
    expect(
      await codeOf(detectDocument('a.pdf', Buffer.from('just text'))),
    ).toBe('UNSUPPORTED_TYPE');
  });

  it('treats a zip without word/document.xml as a damaged DOCX', async () => {
    const zip = Buffer.from(zipSync({ 'hello.txt': strToU8('hi') }));
    expect(await codeOf(detectDocument('a.docx', zip))).toBe('FILE_CORRUPTED');
  });

  it('rejects a non-zip named .docx', async () => {
    expect(
      await codeOf(detectDocument('a.docx', Buffer.from('not a zip'))),
    ).toBe('UNSUPPORTED_TYPE');
  });

  it('accepts a minimal valid DOCX structure', async () => {
    const zip = Buffer.from(
      zipSync({ 'word/document.xml': strToU8('<w:document/>') }),
    );
    expect((await detectDocument('a.docx', zip)).ext).toBe('docx');
  });

  it('rejects files over 10 MB', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
    expect(await codeOf(detectDocument('big.txt', big))).toBe('FILE_TOO_LARGE');
  });
});

describe('safeFileName', () => {
  it('strips paths and control characters', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\me\\spec.pdf')).toBe('spec.pdf');
    expect(safeFileName('a\u0000b\nc.pdf')).toBe('abc.pdf');
  });
  it('keeps non-ASCII names and never returns an empty name', () => {
    expect(safeFileName('Письмо клиента.txt')).toBe('Письмо клиента.txt');
    expect(safeFileName('   ')).toBe('document');
  });
});
