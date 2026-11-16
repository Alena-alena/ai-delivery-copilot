import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/db.js';
import { profiles, workspaceMembers, workspaces } from '../db/schema.js';
import { personalWorkspaceName, UsersService } from './users.service.js';

/** Minimal fake of the drizzle insert chain, recording what is inserted where. */
function fakeDb(profileInserted: boolean) {
  const inserts: { table: unknown; values: unknown }[] = [];
  const tx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        const returning = () =>
          Promise.resolve(
            table === profiles
              ? profileInserted
                ? [{ id: 'u1' }]
                : []
              : [{ id: 'ws-1' }],
          );
        // awaitable (membership insert) and chainable (profile/workspace insert)
        type Chain = Promise<void> & {
          onConflictDoNothing: () => Chain;
          returning: () => Promise<{ id: string }[]>;
        };
        const chain: Chain = Object.assign(Promise.resolve(), {
          onConflictDoNothing: () => chain,
          returning,
        });
        return chain;
      },
    }),
  };
  const transaction = vi.fn(async (fn: (t: typeof tx) => Promise<void>) =>
    fn(tx),
  );
  return { db: { transaction } as unknown as Database, inserts, transaction };
}

const user = { id: 'u1', email: 'alena@example.com' };

describe('UsersService.ensureUser', () => {
  it('creates profile, personal workspace and owner membership in one transaction', async () => {
    const { db, inserts, transaction } = fakeDb(true);
    await new UsersService(db).ensureUser(user);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(inserts.map((i) => i.table)).toEqual([
      profiles,
      workspaces,
      workspaceMembers,
    ]);
    expect(inserts[1]!.values).toEqual({ name: "alena's workspace" });
    expect(inserts[2]!.values).toEqual({
      workspaceId: 'ws-1',
      userId: 'u1',
      role: 'owner',
    });
  });

  it('creates nothing more when the profile already exists', async () => {
    const { db, inserts } = fakeDb(false);
    await new UsersService(db).ensureUser(user);
    expect(inserts.map((i) => i.table)).toEqual([profiles]);
  });

  it('skips the database for a user it has already provisioned', async () => {
    const { db, transaction } = fakeDb(true);
    const service = new UsersService(db);
    await service.ensureUser(user);
    await service.ensureUser(user);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('does not remember a user when the transaction fails', async () => {
    const { db, transaction } = fakeDb(true);
    transaction.mockRejectedValueOnce(new Error('db down'));
    const service = new UsersService(db);
    await expect(service.ensureUser(user)).rejects.toThrow('db down');
    await service.ensureUser(user);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});

describe('personalWorkspaceName', () => {
  it('uses the part of the email before @', () => {
    expect(personalWorkspaceName('bob@x.co')).toBe("bob's workspace");
  });
});
