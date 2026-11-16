import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Document, DocumentDetail } from '@copilot/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { DATABASE } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { documentSegments, documents } from '../db/schema.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import {
  StorageService,
  documentStorageKey,
} from '../storage/storage.service.js';
import { DocumentJobs } from './document-jobs.js';
import { detectDocument, safeFileName } from './file-validation.js';

export type DocumentRow = typeof documents.$inferSelect;

export function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    mime: row.mime,
    size: row.size,
    status: row.status,
    errorCode: row.errorCode,
    pageCount: row.pageCount,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface UploadedFileData {
  originalname: string;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ProjectAccessService) private readonly access: ProjectAccessService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(DocumentJobs) private readonly jobs: DocumentJobs,
  ) {}

  /** Validates the content, stores the file, records it and queues text extraction. */
  async upload(
    userId: string,
    projectId: string,
    file: UploadedFileData,
  ): Promise<Document> {
    // The owner check comes first: a foreign project is a 404 before anything is read or stored.
    const project = await this.access.requireProject(userId, projectId);

    const name = safeFileName(file.originalname);
    const detected = await detectDocument(name, file.buffer);

    const id = randomUUID();
    const storageKey = documentStorageKey(
      project.workspaceId,
      project.id,
      id,
      detected.ext,
    );
    await this.storage.put(storageKey, file.buffer);

    let row: DocumentRow;
    try {
      [row] = (await this.db
        .insert(documents)
        .values({
          id,
          projectId: project.id,
          name,
          mime: detected.mime,
          size: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          storageKey,
          uploadedBy: userId,
        })
        .returning()) as [DocumentRow];
    } catch (err) {
      // No row means nothing would ever point at the stored file: remove it.
      await this.storage.delete(storageKey).catch(() => undefined);
      throw err;
    }

    await this.queueExtraction(row);
    return toDocument(row);
  }

  async list(userId: string, projectId: string): Promise<Document[]> {
    await this.access.requireProject(userId, projectId);
    const rows = await this.db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(desc(documents.createdAt));
    return rows.map(toDocument);
  }

  /** The document, or 404 if the project is not the user's or the document is not in that project. */
  async requireDocument(
    userId: string,
    projectId: string,
    documentId: string,
  ): Promise<DocumentRow> {
    await this.access.requireProject(userId, projectId);
    const [row] = await this.db
      .select()
      .from(documents)
      .where(
        and(eq(documents.id, documentId), eq(documents.projectId, projectId)),
      );
    if (!row) throw new NotFoundException('Document not found');
    return row;
  }

  async get(
    userId: string,
    projectId: string,
    documentId: string,
  ): Promise<DocumentDetail> {
    const row = await this.requireDocument(userId, projectId, documentId);
    const segments = await this.db
      .select()
      .from(documentSegments)
      .where(eq(documentSegments.documentId, row.id))
      .orderBy(asc(documentSegments.index));
    return {
      ...toDocument(row),
      segments: segments.map((s) => ({
        id: s.id,
        index: s.index,
        page: s.page,
        text: s.text,
        tokenCount: s.tokenCount,
      })),
    };
  }

  /** Deletes the row (segments cascade) and then the file; a leftover file is harmless, a dangling row is not. */
  async remove(
    userId: string,
    projectId: string,
    documentId: string,
  ): Promise<void> {
    const row = await this.requireDocument(userId, projectId, documentId);
    await this.db.delete(documents).where(eq(documents.id, row.id));
    await this.storage.delete(row.storageKey).catch((err: unknown) => {
      this.logger.warn(
        `Could not delete file ${row.storageKey}: ${String(err)}`,
      );
    });
  }

  /** Runs extraction again for a failed document. */
  async retry(
    userId: string,
    projectId: string,
    documentId: string,
  ): Promise<Document> {
    const row = await this.requireDocument(userId, projectId, documentId);
    if (row.status !== 'extraction_failed') {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Only a failed document can be processed again',
      });
    }
    const [updated] = (await this.db
      .update(documents)
      .set({ status: 'uploaded', errorCode: null })
      .where(eq(documents.id, row.id))
      .returning()) as [DocumentRow];
    await this.queueExtraction(updated);
    return toDocument(updated);
  }

  /** The original file, for download. The owner check happens in requireDocument. */
  async download(
    userId: string,
    projectId: string,
    documentId: string,
  ): Promise<{ name: string; mime: string; bytes: Buffer }> {
    const row = await this.requireDocument(userId, projectId, documentId);
    const bytes = await this.storage.get(row.storageKey);
    return { name: row.name, mime: row.mime, bytes };
  }

  /** If queuing fails the document must not stay "uploaded" forever: mark it failed so it can be retried. */
  private async queueExtraction(row: DocumentRow): Promise<void> {
    try {
      await this.jobs.enqueueExtract(row.id);
    } catch {
      await this.db
        .update(documents)
        .set({ status: 'extraction_failed', errorCode: 'EXTRACTION_FAILED' })
        .where(eq(documents.id, row.id));
      row.status = 'extraction_failed';
      row.errorCode = 'EXTRACTION_FAILED';
    }
  }
}
