import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ANALYSIS_ERROR_MESSAGES,
  documentErrorMessage,
  type AnalysisOverview,
  type AnalysisRun,
  type AnalysisErrorCode,
  type ConfirmRequirementsInput,
  type Requirement,
  type UpdateRequirementInput,
} from '@copilot/contracts';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { DATABASE } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import {
  analysisRuns,
  documents,
  requirementSources,
  requirements,
} from '../db/schema.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { AnalysisJobs } from './analysis-jobs.js';

type RunRow = typeof analysisRuns.$inferSelect;
type RequirementRow = typeof requirements.$inferSelect;

function reject(code: AnalysisErrorCode, status: number): never {
  throw new HttpException(
    { code, message: ANALYSIS_ERROR_MESSAGES[code] },
    status,
  );
}

export function toRun(row: RunRow): AnalysisRun {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    promptVersion: row.promptVersion,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    costUsd: row.costUsd,
    requirementsFound: row.requirementsFound,
    documentCount: row.documentCount,
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class AnalysisService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ProjectAccessService) private readonly access: ProjectAccessService,
    @Inject(AnalysisJobs) private readonly jobs: AnalysisJobs,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  /** The latest run and what a new run would read (and what it would skip, with the reason). */
  async overview(userId: string, projectId: string): Promise<AnalysisOverview> {
    await this.access.requireProject(userId, projectId);
    const [run] = await this.db
      .select()
      .from(analysisRuns)
      .where(eq(analysisRuns.projectId, projectId))
      .orderBy(desc(analysisRuns.createdAt))
      .limit(1);
    const docs = await this.db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(asc(documents.createdAt));

    const included = docs
      .filter((d) => d.status === 'extracted')
      .map((d) => ({ id: d.id, name: d.name, tokenCount: d.tokenCount ?? 0 }));
    const excluded = docs
      .filter((d) => d.status !== 'extracted')
      .map((d) => ({
        id: d.id,
        name: d.name,
        reason:
          d.status === 'extraction_failed'
            ? documentErrorMessage(d.errorCode)
            : 'Still being processed',
      }));
    const tokens = included.reduce((a, d) => a + d.tokenCount, 0);
    const perMtok = this.config.get('ANALYSIS_COST_PER_MTOK_USD', {
      infer: true,
    });
    return {
      run: run ? toRun(run) : null,
      included,
      excluded,
      estimate: { tokens, costUsd: (tokens / 1_000_000) * perMtok },
    };
  }

  /** Creates a queued run and queues its execution. One active run per project (a unique index enforces it). */
  async start(userId: string, projectId: string): Promise<AnalysisRun> {
    await this.access.requireProject(userId, projectId);
    const [ready] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.status, 'extracted'),
        ),
      );
    if (!ready || ready.n === 0) reject('NO_DOCUMENTS_READY', 409);

    let run: RunRow;
    try {
      [run] = (await this.db
        .insert(analysisRuns)
        .values({ projectId, startedBy: userId, documentCount: ready.n })
        .returning()) as [RunRow];
    } catch (err) {
      if (isUniqueViolation(err)) reject('ANALYSIS_ALREADY_RUNNING', 409);
      throw err;
    }

    try {
      await this.jobs.enqueueRun(run.id);
    } catch {
      // queuing failed: the run must not stay "queued" forever and block the next one
      const [failed] = await this.db
        .update(analysisRuns)
        .set({
          status: 'failed',
          errorCode: 'ANALYSIS_FAILED',
          finishedAt: sql`now()`,
        })
        .where(eq(analysisRuns.id, run.id))
        .returning();
      return toRun(failed ?? run);
    }
    return toRun(run);
  }

  /** Cancels the active run. Results that arrive afterwards are discarded by the runner. */
  async cancel(userId: string, projectId: string): Promise<AnalysisRun> {
    await this.access.requireProject(userId, projectId);
    const [row] = await this.db
      .update(analysisRuns)
      .set({ status: 'cancelled', finishedAt: sql`now()` })
      .where(
        and(
          eq(analysisRuns.projectId, projectId),
          inArray(analysisRuns.status, ['queued', 'running']),
        ),
      )
      .returning();
    if (!row) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'There is no running analysis to cancel',
      });
    }
    return toRun(row);
  }

  async list(userId: string, projectId: string): Promise<Requirement[]> {
    await this.access.requireProject(userId, projectId);
    const rows = await this.db
      .select()
      .from(requirements)
      .where(eq(requirements.projectId, projectId))
      .orderBy(asc(requirements.number));
    return this.withSources(rows);
  }

  /** Changes the status, or edits the text or priority (which marks the requirement as edited). */
  async update(
    userId: string,
    projectId: string,
    requirementId: string,
    input: UpdateRequirementInput,
  ): Promise<Requirement> {
    await this.access.requireProject(userId, projectId);
    const edits =
      input.title !== undefined ||
      input.description !== undefined ||
      input.priority !== undefined;
    const [row] = await this.db
      .update(requirements)
      .set({
        ...(input.status !== undefined && { status: input.status }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(edits && { editedByUser: true }),
      })
      .where(
        and(
          eq(requirements.id, requirementId),
          eq(requirements.projectId, projectId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException('Requirement not found');
    return (await this.withSources([row]))[0]!;
  }

  /** Confirms several requirements at once. Ids from another project are ignored, not an error. */
  async confirm(
    userId: string,
    projectId: string,
    input: ConfirmRequirementsInput,
  ): Promise<Requirement[]> {
    await this.access.requireProject(userId, projectId);
    const rows = await this.db
      .update(requirements)
      .set({ status: 'confirmed' })
      .where(
        and(
          eq(requirements.projectId, projectId),
          inArray(requirements.id, input.ids),
        ),
      )
      .returning();
    return this.withSources(rows);
  }

  private async withSources(rows: RequirementRow[]): Promise<Requirement[]> {
    if (rows.length === 0) return [];
    const sources = await this.db
      .select({
        requirementId: requirementSources.requirementId,
        documentId: requirementSources.documentId,
        documentName: documents.name,
        page: requirementSources.page,
        quote: requirementSources.quote,
      })
      .from(requirementSources)
      .innerJoin(documents, eq(documents.id, requirementSources.documentId))
      .where(
        inArray(
          requirementSources.requirementId,
          rows.map((r) => r.id),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      number: r.number,
      title: r.title,
      description: r.description,
      type: r.type,
      priority: r.priority,
      status: r.status,
      editedByUser: r.editedByUser,
      confidence: r.confidence,
      aiComment: r.aiComment,
      sourceUnverified: r.sourceUnverified,
      sources: sources
        .filter((s) => s.requirementId === r.id)
        .map(({ documentId, documentName, page, quote }) => ({
          documentId,
          documentName,
          page,
          quote,
        })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}

function isUniqueViolation(err: unknown): boolean {
  // Postgres error 23505, possibly wrapped by the driver or by Drizzle
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    if ((e as { code?: string }).code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
