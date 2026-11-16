import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '@copilot/contracts';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { documents, projects } from '../db/schema.js';
import { StorageService } from '../storage/storage.service.js';
import {
  ProjectAccessService,
  type ProjectRow,
} from './project-access.service.js';

/** Missing or blank means "no description". */
const normalizeDescription = (v: string | null | undefined): string | null =>
  v?.trim() ? v.trim() : null;

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ProjectAccessService) private readonly access: ProjectAccessService,
  ) {}

  async list(userId: string): Promise<Project[]> {
    return (await this.access.listProjects(userId)).map(toProject);
  }

  async get(userId: string, id: string): Promise<Project> {
    return toProject(await this.access.requireProject(userId, id));
  }

  async create(userId: string, input: CreateProjectInput): Promise<Project> {
    const workspaceId = await this.access.defaultWorkspaceId(userId);
    const [row] = await this.db
      .insert(projects)
      .values({
        workspaceId,
        name: input.name,
        description: normalizeDescription(input.description),
        createdBy: userId,
      })
      .returning();
    return toProject(row!);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    await this.access.requireProject(userId, id);
    const patch: Partial<typeof projects.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) {
      patch.description = normalizeDescription(input.description);
    }
    const [row] = await this.db
      .update(projects)
      .set(patch)
      .where(eq(projects.id, id))
      .returning();
    return toProject(row!);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.access.requireProject(userId, id);
    // Documents and segments disappear with the project (cascade), but their files do not: collect
    // the keys first, delete the rows, then remove the files (a leftover file is harmless garbage).
    const files = await this.db
      .select({ key: documents.storageKey })
      .from(documents)
      .where(eq(documents.projectId, id));
    await this.db.delete(projects).where(eq(projects.id, id));
    const results = await Promise.allSettled(
      files.map((f) => this.storage.delete(f.key)),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        this.logger.warn(
          `Could not delete a file of project ${id}: ${String(r.reason)}`,
        );
      }
    }
  }
}
