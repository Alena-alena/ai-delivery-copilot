import type { AnalysisStep } from '@copilot/contracts';
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
  gaps,
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

/** The Python service's answer for POST /v1/analysis/gaps. */
export interface GapsResponse {
  gaps: {
    type: 'missing_information' | 'missing_requirement' | 'unclear_wording';
    severity: 'high' | 'medium' | 'low';
    text: string;
    requirement_refs: string[];
    question: string;
  }[];
  usage: RequirementsResponse['usage'];
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
      case 'ANALYSIS_TOO_LARGE':
        return 'ANALYSIS_TOO_LARGE';
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
      .set({ status: 'running', step: 'requirements' })
      .where(and(eq(analysisRuns.id, runId), eq(analysisRuns.status, 'queued')))
      .returning();
    if (!run) return; // cancelled, or already handled by another worker

    try {
      const docs = await this.loadDocuments(run.projectId);
      if (docs.length === 0)
        return await this.fail(runId, 'NO_DOCUMENTS_READY');
      const timeout = this.config.get('AI_ANALYSIS_TIMEOUT_MS', {
        infer: true,
      });
      const result = await this.ai.post<RequirementsResponse>(
        '/v1/analysis/requirements',
        { documents: docs },
        requestId,
        timeout,
      );
      // Gaps are judged against the requirements just found. Nothing is saved until both steps have answered.
      if (!(await this.setStep(runId, 'gaps'))) return; // cancelled meanwhile: do not spend on the next call
      const gapsResult = await this.ai.post<GapsResponse>(
        '/v1/analysis/gaps',
        {
          documents: docs,
          requirements: result.requirements.map((r, i) => ({
            ref: `R${i + 1}`,
            title: r.title,
            description: r.description,
          })),
        },
        requestId,
        timeout,
      );
      await this.save(run.projectId, runId, docs.length, result, gapsResult);
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
      .set({
        status: 'failed',
        step: null,
        errorCode: code,
        finishedAt: sql`now()`,
      })
      // only a run that is still running: a cancel that arrived meanwhile stays cancelled
      .where(
        and(eq(analysisRuns.id, runId), eq(analysisRuns.status, 'running')),
      );
  }

  /** Moves a running run to its next step. False when the run is no longer running (it was cancelled). */
  private async setStep(runId: string, step: AnalysisStep): Promise<boolean> {
    const rows = await this.db
      .update(analysisRuns)
      .set({ step })
      .where(
        and(eq(analysisRuns.id, runId), eq(analysisRuns.status, 'running')),
      )
      .returning({ id: analysisRuns.id });
    return rows.length > 0;
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
    gapsResult: GapsResponse,
  ): Promise<void> {
    // Pages of the cited segments, read once and before the lock is taken.
    const segmentIds = [
      ...new Set(
        result.requirements.flatMap((r) => r.sources.map((s) => s.segment_id)),
      ),
    ];
    const pageBySegment = new Map<string, number | null>(
      segmentIds.length === 0
        ? []
        : (
            await this.db
              .select({ id: documentSegments.id, page: documentSegments.page })
              .from(documentSegments)
              .where(inArray(documentSegments.id, segmentIds))
          ).map((x) => [x.id, x.page]),
    );

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
        .select({ title: requirements.title, number: requirements.number })
        .from(requirements)
        .where(eq(requirements.projectId, projectId));
      const seen = new Set(kept.map((k) => titleKey(k.title)));
      // REQ number by title, so a gap can point at a requirement that was kept as well as at a new one
      const numberByTitle = new Map(
        kept.map((k) => [titleKey(k.title), k.number]),
      );
      let next = (max?.n ?? 0) + 1;

      const fresh: {
        r: (typeof result.requirements)[number];
        number: number;
      }[] = [];
      for (const r of result.requirements) {
        const key = titleKey(r.title);
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push({ r, number: next++ });
      }
      for (const { r, number } of fresh)
        numberByTitle.set(titleKey(r.title), number);
      const inserted = fresh.length;
      if (inserted > 0) {
        const rows = await tx
          .insert(requirements)
          .values(
            fresh.map(({ r, number }) => ({
              projectId,
              runId,
              number,
              title: r.title,
              description: r.description,
              type: r.type,
              priority: r.priority,
              confidence: r.confidence,
              aiComment: r.ai_comment,
              sourceUnverified: r.source_unverified,
            })),
          )
          .returning({ id: requirements.id, number: requirements.number });
        const idByNumber = new Map(rows.map((x) => [x.number, x.id]));
        const sources = fresh.flatMap(({ r, number }) =>
          r.sources.map((s) => ({
            requirementId: idByNumber.get(number)!,
            documentId: s.document_id,
            segmentId: s.segment_id,
            page: pageBySegment.get(s.segment_id) ?? null,
            quote: s.quote,
          })),
        );
        if (sources.length > 0)
          await tx.insert(requirementSources).values(sources);
      }

      const gapsInserted = await this.saveGaps(
        tx,
        projectId,
        runId,
        gapsResult,
        result.requirements.map((r) => numberByTitle.get(titleKey(r.title))),
      );

      await tx
        .update(analysisRuns)
        .set({
          status: 'succeeded',
          step: null,
          promptVersion: `${result.prompt_version} + ${gapsResult.prompt_version}`,
          model: result.usage.model,
          promptTokens:
            result.usage.prompt_tokens + gapsResult.usage.prompt_tokens,
          completionTokens:
            result.usage.completion_tokens + gapsResult.usage.completion_tokens,
          costUsd: result.usage.cost_usd + gapsResult.usage.cost_usd,
          requirementsFound: inserted,
          gapsFound: gapsInserted,
          documentCount,
          finishedAt: sql`now()`,
        })
        .where(eq(analysisRuns.id, runId));
    });
  }
  /**
   * Same rule as for requirements: gaps a person closed (resolved, dismissed) are kept with their note, open ones are
   * replaced, a repeat of a kept gap is not added again, and G numbers are never reused. Runs inside the save
   * transaction, under the project's lock. `numberByRef[i]` is the REQ number of the requirement sent as `R{i+1}`.
   */
  private async saveGaps(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    projectId: string,
    runId: string,
    result: GapsResponse,
    numberByRef: (number | undefined)[],
  ): Promise<number> {
    const [max] = await tx
      .select({ n: sql<number>`coalesce(max(${gaps.number}), 0)::int` })
      .from(gaps)
      .where(eq(gaps.projectId, projectId));
    await tx
      .delete(gaps)
      .where(and(eq(gaps.projectId, projectId), eq(gaps.status, 'open')));
    const kept = await tx
      .select({ text: gaps.text })
      .from(gaps)
      .where(eq(gaps.projectId, projectId));
    const seen = new Set(kept.map((k) => titleKey(k.text)));
    let next = (max?.n ?? 0) + 1;
    const rows: (typeof gaps.$inferInsert)[] = [];
    for (const g of result.gaps) {
      const key = titleKey(g.text);
      if (seen.has(key)) continue;
      seen.add(key);
      const requirementNumbers = [
        ...new Set(
          g.requirement_refs
            .map((ref) => numberByRef[Number(ref.slice(1)) - 1])
            .filter((n): n is number => n !== undefined),
        ),
      ];
      rows.push({
        projectId,
        runId,
        number: next++,
        type: g.type,
        severity: g.severity,
        text: g.text,
        question: g.question,
        requirementNumbers,
      });
    }
    if (rows.length > 0) await tx.insert(gaps).values(rows);
    return rows.length;
  }
}
