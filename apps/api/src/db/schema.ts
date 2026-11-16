import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';

// Row Level Security is enabled on every table and no policies are defined: the browser (anon /
// authenticated roles) can read nothing directly. Only NestJS reads and writes, over a server-side
// connection, and it enforces access itself (see docs/data-model.md and ADR 0003).

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`);

export const workspaceRole = pgEnum('workspace_role', ['owner']);

/** One row per Supabase user; `id` is the same uuid as `auth.users.id`. */
export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: createdAt(),
}).enableRLS();

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: createdAt(),
}).enableRLS();

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull().default('owner'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_id_idx').on(t.userId),
  ],
).enableRLS();

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdBy: uuid('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_workspace_id_idx').on(t.workspaceId)],
).enableRLS();

export const documentStatus = pgEnum('document_status', [
  'uploaded',
  'extracting',
  'extracted',
  'extraction_failed',
]);

/** Metadata of an uploaded file. The bytes live in storage (see StorageService), never in the DB. */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Detected from the file's content, not taken from the browser's header. */
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    status: documentStatus('status').notNull().default('uploaded'),
    errorCode: text('error_code'),
    pageCount: integer('page_count'),
    tokenCount: integer('token_count'),
    uploadedBy: uuid('uploaded_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('documents_project_id_idx').on(t.projectId)],
).enableRLS();

/**
 * A cited unit of a document's text. AI answers point at a segment id, never at character offsets,
 * so every quote can be checked against exactly this row.
 */
export const documentSegments = pgTable(
  'document_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    /** 1-based page for PDFs; null for formats without fixed pages (DOCX, TXT). */
    page: integer('page'),
    text: text('text').notNull(),
    tokenCount: integer('token_count').notNull(),
  },
  (t) => [
    uniqueIndex('document_segments_document_id_index_uq').on(
      t.documentId,
      t.index,
    ),
  ],
).enableRLS();
