import { z } from 'zod';

/** The time window of the Usage page. */
export const USAGE_RANGES = ['today', '7d', '30d'] as const;
export const usageRangeSchema = z.enum(USAGE_RANGES);
export type UsageRange = z.infer<typeof usageRangeSchema>;

/** GET /api/usage?range=… */
export const usageQuerySchema = z.object({ range: usageRangeSchema.default('30d') });

/** One AI call. Prompts and answers are never part of it (client documents are confidential). */
export const usageCallSchema = z.object({
  id: z.string(),
  time: z.iso.datetime(),
  /** What the call was for, for example "analysis.requirements"; null if the caller did not say. */
  operation: z.string().nullable(),
  model: z.string(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  costUsd: z.number(),
  latencyMs: z.number().nullable(),
  /** Our request id, which ties the call to the request that caused it. */
  requestId: z.string().nullable(),
});

export const usageSchema = z.object({
  range: usageRangeSchema,
  calls: z.array(usageCallSchema),
  totals: z.object({
    costUsd: z.number(),
    calls: z.number().int(),
    requests: z.number().int(),
    tokens: z.number().int(),
  }),
  /** The spending limit of the AI service key; null when it is not known. */
  budgetUsd: z.number().nullable(),
  /** True when more calls exist than are listed (the newest are kept). */
  truncated: z.boolean(),
});

export type UsageCall = z.infer<typeof usageCallSchema>;
export type Usage = z.infer<typeof usageSchema>;
