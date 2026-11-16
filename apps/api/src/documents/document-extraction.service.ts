import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, ne, sql } from 'drizzle-orm';
import { AiClient } from '../ai/ai.client.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { documentSegments, documents } from '../db/schema.js';
import { StorageService } from '../storage/storage.service.js';

/** The Python service's answer for POST /v1/documents/extract. */
export interface ExtractResponse {
  page_count: number | null;
  token_count: number;
  encoding: string | null;
  segments: {
    index: number;
    page: number | null;
    text: string;
    token_count: number;
  }[];
}

export interface ExtractionAttempt {
  retryCount: number;
  retryLimit: number;
  requestId: string;
}

/** Extraction of one big file can take a while; the queue retries beyond this. */
const EXTRACT_TIMEOUT_MS = 60_000;
/** Statuses that mean "try again later" (rate limit, upstream trouble); everything else is final. */
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const INSERT_CHUNK = 500;

@Injectable()
export class DocumentExtractionService {
  private readonly logger = new Logger(DocumentExtractionService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AiClient) private readonly ai: AiClient,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Extracts a document's text and stores it as segments. Safe to run twice for the same document
   * (a restart can re-deliver a job): segments are replaced in one transaction, and a document that
   * is already done is skipped. Only temporary failures throw (so the queue retries); a document
   * that can never be read is marked failed with a user-facing code and the job completes.
   */
  async extract(documentId: string, attempt: ExtractionAttempt): Promise<void> {
    const [row] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));
    if (!row) return; // deleted while queued
    if (row.status !== 'uploaded' && row.status !== 'extracting') return;

    await this.db
      .update(documents)
      .set({ status: 'extracting', errorCode: null })
      .where(eq(documents.id, documentId));

    try {
      const bytes = await this.storage.get(row.storageKey);
      const result = await this.ai.postBytes<ExtractResponse>(
        '/v1/documents/extract',
        bytes,
        attempt.requestId,
        { query: { mime: row.mime }, timeoutMs: EXTRACT_TIMEOUT_MS },
      );
      await this.saveResult(row.id, row.projectId, result);
    } catch (err) {
      await this.handleFailure(row.id, err, attempt);
    }
  }

  private async handleFailure(
    documentId: string,
    err: unknown,
    attempt: ExtractionAttempt,
  ): Promise<void> {
    const status = err instanceof HttpException ? err.getStatus() : undefined;
    const transient =
      status === undefined ? true : TRANSIENT_STATUSES.has(status);

    if (transient && attempt.retryCount < attempt.retryLimit) {
      this.logger.warn(
        `Extraction of ${documentId} failed temporarily (attempt ${attempt.retryCount + 1}): ${String(err)}`,
      );
      throw err; // the queue retries it with backoff
    }

    const code = transient ? 'EXTRACTION_FAILED' : upstreamCode(err);
    this.logger.warn(`Extraction of ${documentId} failed for good: ${code}`);
    await this.markFailed(documentId, code);
  }

  private async markFailed(documentId: string, code: string): Promise<void> {
    await this.db
      .update(documents)
      .set({ status: 'extraction_failed', errorCode: code })
      .where(eq(documents.id, documentId));
  }

  /** Replaces the document's segments and marks it extracted, or fails it if the project is over its text limit. */
  private async saveResult(
    documentId: string,
    projectId: string,
    result: ExtractResponse,
  ): Promise<void> {
    const limit = this.config.get('PROJECT_TEXT_TOKEN_LIMIT', { infer: true });
    await this.db.transaction(async (tx) => {
      // Serialise per project so two documents finishing together cannot both squeeze under the limit.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${projectId}))`,
      );

      const [others] = await tx
        .select({
          total: sql<number>`coalesce(sum(${documents.tokenCount}), 0)::int`,
        })
        .from(documents)
        .where(
          and(
            eq(documents.projectId, projectId),
            eq(documents.status, 'extracted'),
            ne(documents.id, documentId),
          ),
        );
      if ((others?.total ?? 0) + result.token_count > limit) {
        await tx
          .update(documents)
          .set({ status: 'extraction_failed', errorCode: 'PROJECT_TEXT_LIMIT' })
          .where(eq(documents.id, documentId));
        return;
      }

      await tx
        .delete(documentSegments)
        .where(eq(documentSegments.documentId, documentId));
      for (let i = 0; i < result.segments.length; i += INSERT_CHUNK) {
        await tx.insert(documentSegments).values(
          result.segments.slice(i, i + INSERT_CHUNK).map((s) => ({
            documentId,
            index: s.index,
            page: s.page,
            text: s.text,
            tokenCount: s.token_count,
          })),
        );
      }
      await tx
        .update(documents)
        .set({
          status: 'extracted',
          errorCode: null,
          pageCount: result.page_count,
          tokenCount: result.token_count,
        })
        .where(eq(documents.id, documentId));
    });
  }
}

/** The typed code the Python service sent (e.g. PDF_NO_TEXT_LAYER), or a generic one. */
function upstreamCode(err: unknown): string {
  if (err instanceof HttpException) {
    const body = err.getResponse();
    if (typeof body === 'object' && body !== null && 'code' in body) {
      const code = (body as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
  }
  return 'EXTRACTION_FAILED';
}
