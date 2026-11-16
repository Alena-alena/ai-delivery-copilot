import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from './schema.js';

const tables = [
  schema.profiles,
  schema.workspaces,
  schema.workspaceMembers,
  schema.projects,
];

describe('db schema', () => {
  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    '%s has RLS enabled (no direct browser access)',
    (_name, table) => {
      expect(getTableConfig(table).enableRLS).toBe(true);
      expect(getTableConfig(table).policies).toHaveLength(0);
    },
  );

  it('deleting a workspace cascades to members and projects', () => {
    const onDelete = (table: (typeof tables)[number], column: string) =>
      getTableConfig(table).foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === column),
      )?.onDelete;
    expect(onDelete(schema.workspaceMembers, 'workspace_id')).toBe('cascade');
    expect(onDelete(schema.projects, 'workspace_id')).toBe('cascade');
  });

  it('keeps project history when a user is removed', () => {
    const fk = getTableConfig(schema.projects).foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'created_by'),
    );
    expect(fk?.onDelete).toBe('set null');
  });
});
