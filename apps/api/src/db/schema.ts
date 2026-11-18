import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
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

export const analysisRunStatus = pgEnum('analysis_run_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

/**
 * One analysis of a project's documents. The status is its own state machine, separate from the document
 * statuses. At most one run per project is queued or running at a time (partial unique index).
 */
export const analysisRuns = pgTable(
  'analysis_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: analysisRunStatus('status').notNull().default('queued'),
    /** Which prompt produced the result, so two runs can be compared. */
    promptVersion: text('prompt_version'),
    model: text('model'),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    requirementsFound: integer('requirements_found').notNull().default(0),
    documentCount: integer('document_count').notNull().default(0),
    errorCode: text('error_code'),
    startedBy: uuid('started_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('analysis_runs_project_id_idx').on(t.projectId, t.createdAt),
    uniqueIndex('analysis_runs_one_active_per_project')
      .on(t.projectId)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
).enableRLS();

export const requirementType = pgEnum('requirement_type', [
  'functional',
  'non_functional',
  'constraint',
]);
export const requirementPriority = pgEnum('requirement_priority', [
  'urgent',
  'high',
  'medium',
  'low',
]);
export const requirementStatus = pgEnum('requirement_status', [
  'ai_suggested',
  'confirmed',
  'needs_clarification',
  'rejected',
]);
export const confidenceLevel = pgEnum('confidence_level', [
  'high',
  'medium',
  'low',
]);

/** A requirement the AI proposed and a person reviews. `number` is the human-readable REQ-001 per project. */
export const requirements = pgTable(
  'requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** The run that created it; a re-run only replaces untouched drafts of earlier runs. */
    runId: uuid('run_id').references(() => analysisRuns.id, {
      onDelete: 'set null',
    }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    type: requirementType('type').notNull(),
    priority: requirementPriority('priority').notNull(),
    status: requirementStatus('status').notNull().default('ai_suggested'),
    editedByUser: boolean('edited_by_user').notNull().default(false),
    confidence: confidenceLevel('confidence').notNull(),
    aiComment: text('ai_comment').notNull().default(''),
    sourceUnverified: boolean('source_unverified').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('requirements_project_number_uq').on(t.projectId, t.number),
    index('requirements_project_status_idx').on(t.projectId, t.status),
  ],
).enableRLS();

/** Where a requirement comes from. The quote and page are copied, so they survive a re-extraction. */
export const requirementSources = pgTable(
  'requirement_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => requirements.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    segmentId: uuid('segment_id').references(() => documentSegments.id, {
      onDelete: 'set null',
    }),
    page: integer('page'),
    quote: text('quote').notNull(),
  },
  (t) => [index('requirement_sources_requirement_id_idx').on(t.requirementId)],
).enableRLS();
