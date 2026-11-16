import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { profiles, workspaceMembers, workspaces } from '../db/schema.js';
import type { AuthUser } from './auth.types.js';

export function personalWorkspaceName(email: string): string {
  const name = email.split('@')[0] || 'My';
  return `${name}'s workspace`;
}

@Injectable()
export class UsersService {
  /** Users already provisioned by this process, so most requests skip the database. */
  private readonly known = new Set<string>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * On a user's first request: profile + personal workspace + owner membership, in one transaction.
   * Concurrent first requests are safe: the profile insert conflicts, and only the winner creates the workspace.
   */
  async ensureUser(user: AuthUser): Promise<void> {
    if (this.known.has(user.id)) return;
    await this.db.transaction(async (tx) => {
      const created = await tx
        .insert(profiles)
        .values({ id: user.id, email: user.email })
        .onConflictDoNothing()
        .returning({ id: profiles.id });
      if (created.length === 0) return;

      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: personalWorkspaceName(user.email) })
        .returning({ id: workspaces.id });
      await tx.insert(workspaceMembers).values({
        workspaceId: workspace!.id,
        userId: user.id,
        role: 'owner',
      });
    });
    this.known.add(user.id);
  }

  async getMe(userId: string) {
    const [profile] = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        displayName: profiles.displayName,
      })
      .from(profiles)
      .where(eq(profiles.id, userId));
    const memberships = await this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId));
    return { ...profile!, workspaces: memberships };
  }
}
