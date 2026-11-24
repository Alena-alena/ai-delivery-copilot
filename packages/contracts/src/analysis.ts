import { z } from 'zod';

export const requirementTypeSchema = z.enum(['functional', 'non_functional', 'constraint']);
export const prioritySchema = z.enum(['urgent', 'high', 'medium', 'low']);
export const confidenceSchema = z.enum(['high', 'medium', 'low']);
/** ai_suggested: the AI proposed it, a human has not decided. Only confirmed requirements become tasks. */
export const requirementStatusSchema = z.enum([
  'ai_suggested',
  'confirmed',
  'needs_clarification',
  'rejected',
]);
export const analysisRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

/** The steps of a run, in order. Contradictions will follow the gaps. */
export const analysisStepSchema = z.enum(['requirements', 'gaps']);
export type AnalysisStep = z.infer<typeof analysisStepSchema>;

export type RequirementType = z.infer<typeof requirementTypeSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type RequirementStatus = z.infer<typeof requirementStatusSchema>;
export type AnalysisRunStatus = z.infer<typeof analysisRunStatusSchema>;

/** Codes in analysis error responses and in `errorCode` of a failed run, with what to tell the user. */
export const ANALYSIS_ERROR_MESSAGES = {
  ANALYSIS_ALREADY_RUNNING: 'An analysis is already running for this project.',
  NO_DOCUMENTS_READY:
    'There are no documents with extracted text yet. Upload a document and wait until it is Ready.',
  ANALYSIS_TIMEOUT: 'The AI did not answer in time. Nothing was saved. Try again in a moment.',
  ANALYSIS_BUSY: 'The AI service is busy right now. Try again in a minute.',
  ANALYSIS_INVALID_RESPONSE:
    'The AI returned an answer that could not be used. Try again; if it repeats, the documents may be too unusual.',
  ANALYSIS_TOO_LARGE:
    'The documents are too large to look for gaps in one pass. Remove a document you do not need and try again.',
  ANALYSIS_FAILED: 'The analysis failed. Try again in a moment.',
} as const;
export type AnalysisErrorCode = keyof typeof ANALYSIS_ERROR_MESSAGES;

export function analysisErrorMessage(code: string | null | undefined): string {
  return code && code in ANALYSIS_ERROR_MESSAGES
    ? ANALYSIS_ERROR_MESSAGES[code as AnalysisErrorCode]
    : ANALYSIS_ERROR_MESSAGES.ANALYSIS_FAILED;
}

export const analysisRunSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  status: analysisRunStatusSchema,
  promptVersion: z.string().nullable(),
  model: z.string().nullable(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  costUsd: z.number(),
  requirementsFound: z.number().int(),
  gapsFound: z.number().int(),
  /** The step a queued or running run is on. */
  step: analysisStepSchema.nullable(),
  documentCount: z.number().int(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
export type AnalysisRun = z.infer<typeof analysisRunSchema>;

/** GET /api/projects/:id/analysis: the latest run and what a new run would read. */
export const analysisOverviewSchema = z.object({
  run: analysisRunSchema.nullable(),
  included: z.array(z.object({ id: z.uuid(), name: z.string(), tokenCount: z.number().int() })),
  excluded: z.array(z.object({ id: z.uuid(), name: z.string(), reason: z.string() })),
  estimate: z.object({ tokens: z.number().int(), costUsd: z.number() }),
});
export type AnalysisOverview = z.infer<typeof analysisOverviewSchema>;

export const requirementSourceSchema = z.object({
  documentId: z.uuid(),
  documentName: z.string(),
  page: z.number().int().nullable(),
  quote: z.string(),
});

export const requirementSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  /** Shown as REQ-001; unique inside the project. */
  number: z.number().int(),
  title: z.string(),
  description: z.string(),
  type: requirementTypeSchema,
  priority: prioritySchema,
  status: requirementStatusSchema,
  editedByUser: z.boolean(),
  confidence: confidenceSchema,
  aiComment: z.string(),
  /** The quote could not be matched in the cited text: check the source before confirming. */
  sourceUnverified: z.boolean(),
  sources: z.array(requirementSourceSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Requirement = z.infer<typeof requirementSchema>;

/** PATCH /api/projects/:id/requirements/:requirementId. Editing text or priority marks it as edited. */
export const updateRequirementSchema = z
  .object({
    status: requirementStatusSchema,
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().max(4000),
    priority: prioritySchema,
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;

/** POST /api/projects/:id/requirements/confirm */
export const confirmRequirementsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
});
export type ConfirmRequirementsInput = z.infer<typeof confirmRequirementsSchema>;

export function requirementNumber(n: number): string {
  return `REQ-${String(n).padStart(3, '0')}`;
}

export const gapTypeSchema = z.enum(['missing_information', 'missing_requirement', 'unclear_wording']);
export const gapSeveritySchema = z.enum(['high', 'medium', 'low']);
/** open: needs an answer. resolved: answered (a note says how). dismissed: not a problem (a note says why). */
export const findingStatusSchema = z.enum(['open', 'resolved', 'dismissed']);
export type GapType = z.infer<typeof gapTypeSchema>;
export type GapSeverity = z.infer<typeof gapSeveritySchema>;
export type FindingStatus = z.infer<typeof findingStatusSchema>;

export const gapSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  /** Shown as G-001; unique inside the project. */
  number: z.number().int(),
  type: gapTypeSchema,
  severity: gapSeveritySchema,
  text: z.string(),
  /** A ready question to send to the client. */
  question: z.string(),
  /** REQ numbers the gap is about. Empty: the topic is absent from the documents. */
  requirementNumbers: z.array(z.number().int()),
  status: findingStatusSchema,
  note: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Gap = z.infer<typeof gapSchema>;

/** PATCH /api/projects/:id/gaps/:gapId. Resolving or dismissing may carry a comment; reopening clears it. */
export const updateGapSchema = z.object({
  status: findingStatusSchema,
  note: z.string().trim().max(2000).optional(),
});
export type UpdateGapInput = z.infer<typeof updateGapSchema>;

export function gapNumber(n: number): string {
  return `G-${String(n).padStart(3, '0')}`;
}
