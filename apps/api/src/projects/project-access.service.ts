import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { DATABASE } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { projects, workspaceMembers } from '../db/schema.js';

export type ProjectRow = typeof projects.$inferSelect;

/**
 * The one place that decides who may see a project: a project is visible only to members of its
 * workspace. Every query is scoped by the caller's user id in SQL (a join on workspace_members),
 * so another user's project is simply "not found". Never fetch a project by id alone.
 */
@Injectable()
export class ProjectAccessService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listProjects(userId: string): Promise<ProjectRow[]> {
    const rows = await this.db
      .select({ project: projects })
      .from(projects)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, projects.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .orderBy(desc(projects.createdAt));
    return rows.map((r) => r.project);
  }

  /** The project, or a 404 if it does not exist OR the user is not a member of its workspace. */
  async requireProject(userId: string, projectId: string): Promise<ProjectRow> {
    const [row] = await this.db
      .select({ project: projects })
      .from(projects)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, projects.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .where(eq(projects.id, projectId));
    if (!row) throw new NotFoundException('Project not found');
    return row.project;
  }

  /** Where new projects go. MVP: the user's first (personal) workspace; teams will pass an id. */
  async defaultWorkspaceId(userId: string): Promise<string> {
    const [row] = await this.db
      .select({ id: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaceMembers.createdAt))
      .limit(1);
    // The auth guard provisions a workspace on first request, so this is an invariant, not a user error.
    if (!row) throw new Error(`User ${userId} has no workspace`);
    return row.id;
  }
}
