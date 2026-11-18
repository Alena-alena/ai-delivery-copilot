import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { AiClient } from '../ai/ai.client.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import {
  analysisRuns,
  documentSegments,
  documents,
  requirementSources,
  requirements,
} from '../db/schema.js';

/** The Python service's answer for POST /v1/analysis/requirements. */
export interface RequirementsResponse {
  requirements: {
    title: string;
    description: string;
    type: 'functional' | 'non_functional' | 'constraint';
    priority: 'urgent' | 'high' | 'medium' | 'low';
    confidence: 'high' | 'medium' | 'low';
    ai_comment: string;
    source_unverified: boolean;
    sources: { document_id: string; segment_id: string; quote: string }[];
  }[];
  usage: {
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
    model: string;
  };
  prompt_version: string;
}

/** Titles are compared without case, punctuation and spacing, so "Online booking!" equals "online  booking". */
export const titleKey = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Maps what the AI service answered to the code stored on a failed run. */
export function failureCode(err: unknown): string {
  if (err instanceof HttpException) {
    const body = err.getResponse() as { code?: string };
    switch (body.code) {
      case 'LLM_TIMEOUT':
      case 'AI_TIMEOUT':
        return 'ANALYSIS_TIMEOUT';
      case 'LLM_RATE_LIMITED':
        return 'ANALYSIS_BUSY';
      case 'LLM_INVALID_RESPONSE':
        return 'ANALYSIS_INVALID_RESPONSE';
    }
  }
  return 'ANALYSIS_FAILED';
}

/** Executes one queued analysis run: reads the documents, asks the AI service, saves the requirements. */
@Injectable()
export class AnalysisRunner {
  private readonly logger = new Logger(AnalysisRunner.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AiClient) private readonly ai: AiClient,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  /** Never throws for a failed analysis: the failure is recorded on the run, and the job completes. */
  async execute(runId: string, requestId: string): Promise<void> {
    // queued -> running, atomically: a run that was cancelled while queued is not started.
    const [run] = await this.db
      .update(analysisRuns)
      .set({ status: 'running' })
      .where(and(eq(analysisRuns.id, runId), eq(analysisRuns.status, 'queued')))
      .returning();
    if (!run) return; // cancelled, or already handled by another worker

    try {
      const docs = await this.loadDocuments(run.projectId);
      if (docs.length === 0)
        return await this.fail(runId, 'NO_DOCUMENTS_READY');
      const result = await this.ai.post<RequirementsResponse>(
        '/v1/analysis/requirements',
        { documents: docs },
        requestId,
        this.config.get('AI_ANALYSIS_TIMEOUT_MS', { infer: true }),
      );
      await this.save(run.projectId, runId, docs.length, result);
    } catch (err) {
      const code = failureCode(err);
      this.logger.warn(`Analysis ${runId} failed: ${code} (${String(err)})`);
      await this.fail(runId, code);
    }
  }

  private async loadDocuments(projectId: string) {
    const docs = await this.db
      .select({ id: documents.id, name: documents.name })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.status, 'extracted'),
        ),
      )
      .orderBy(asc(documents.createdAt));
    if (docs.length === 0) return [];
    const segs = await this.db
      .select()
      .from(documentSegments)
      .where(
        inArray(
          documentSegments.documentId,
          docs.map((d) => d.id),
        ),
      )
      .orderBy(asc(documentSegments.documentId), asc(documentSegments.index));
    return docs
      .map((d) => ({
        id: d.id,
        name: d.name,
        segments: segs
          .filter((s) => s.documentId === d.id)
          .map((s) => ({ id: s.id, page: s.page, text: s.text })),
      }))
      .filter((d) => d.segments.length > 0);
  }

  private async fail(runId: string, code: string): Promise<void> {
    await this.db
      .update(analysisRuns)
      .set({ status: 'failed', errorCode: code, finishedAt: sql`now()` })
      // only a run that is still running: a cancel that arrived meanwhile stays cancelled
      .where(
        and(eq(analysisRuns.id, runId), eq(analysisRuns.status, 'running')),
      );
  }

  /**
   * Saves the result in one transaction, serialised per project. A re-run keeps everything a person touched
   * (edited, confirmed, needs clarification, rejected); only untouched AI suggestions from earlier runs are
   * replaced, and a new finding that repeats a kept requirement (same title) is not added twice.
   */
  private async save(
    projectId: string,
    runId: string,
    documentCount: number,
    result: RequirementsResponse,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${projectId}))`,
      );

      // The user may have cancelled while the AI was working: then nothing is saved.
      const [current] = await tx
        .select({ status: analysisRuns.status })
        .from(analysisRuns)
        .where(eq(analysisRuns.id, runId));
      if (current?.status !== 'running') return;

      // read the highest number BEFORE deleting: a REQ number is never handed out twice
      const [max] = await tx
        .select({
          n: sql<number>`coalesce(max(${requirements.number}), 0)::int`,
        })
        .from(requirements)
        .where(eq(requirements.projectId, projectId));
      await tx
        .delete(requirements)
        .where(
          and(
            eq(requirements.projectId, projectId),
            eq(requirements.status, 'ai_suggested'),
            eq(requirements.editedByUser, false),
          ),
        );
      const kept = await tx
        .select({ title: requirements.title })
        .from(requirements)
        .where(eq(requirements.projectId, projectId));
      const seen = new Set(kept.map((k) => titleKey(k.title)));
      let next = (max?.n ?? 0) + 1;
      let inserted = 0;

      for (const r of result.requirements) {
        const key = titleKey(r.title);
        if (seen.has(key)) continue;
        seen.add(key);
        const [row] = await tx
          .insert(requirements)
          .values({
            projectId,
            runId,
            number: next++,
            title: r.title,
            description: r.description,
            type: r.type,
            priority: r.priority,
            confidence: r.confidence,
            aiComment: r.ai_comment,
            sourceUnverified: r.source_unverified,
          })
          .returning({ id: requirements.id });
        inserted++;
        for (const s of r.sources) {
          const [seg] = await tx
            .select({ page: documentSegments.page })
            .from(documentSegments)
            .where(eq(documentSegments.id, s.segment_id));
          await tx.insert(requirementSources).values({
            requirementId: row!.id,
            documentId: s.document_id,
            segmentId: s.segment_id,
            page: seg?.page ?? null,
            quote: s.quote,
          });
        }
      }

      await tx
        .update(analysisRuns)
        .set({
          status: 'succeeded',
          promptVersion: result.prompt_version,
          model: result.usage.model,
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          costUsd: result.usage.cost_usd,
          requirementsFound: inserted,
          documentCount,
          finishedAt: sql`now()`,
        })
        .where(eq(analysisRuns.id, runId));
    });
  }
}
