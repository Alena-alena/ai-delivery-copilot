import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UsageCall } from '@copilot/contracts';
import { z } from 'zod';
import type { Env } from '../config/env.js';

const TIMEOUT_MS = 10_000;
/** More rows than this in one answer are cut off (the newest are kept) so the page stays fast. */
export const MAX_CALLS = 1000;

// Only the fields we use. The raw spend log also holds the key hash, IP address and the request, which must not leave.
const rawLogSchema = z.object({
  request_id: z.string(),
  startTime: z.string(),
  endTime: z.string().nullish(),
  model: z.string().nullish(),
  spend: z.number().nullish(),
  prompt_tokens: z.number().nullish(),
  completion_tokens: z.number().nullish(),
  metadata: z
    .object({
      spend_logs_metadata: z
        .object({
          operation: z.string().nullish(),
          request_id: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
const rawLogsSchema = z.array(z.unknown());

/** Reads the AI call log and the spending limit from LiteLLM. LiteLLM stays an implementation detail of this class. */
@Injectable()
export class LitellmUsageClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Calls from `since` (a Date) until now, newest first, at most MAX_CALLS. */
  async calls(
    since: Date,
  ): Promise<{ calls: UsageCall[]; truncated: boolean }> {
    const end = new Date(Date.now() + 24 * 3600 * 1000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const body = await this.get(
      `/spend/logs?summarize=false&start_date=${day(since)}&end_date=${day(end)}`,
    );
    const rows = rawLogsSchema.safeParse(body);
    if (!rows.success)
      this.unavailable('LiteLLM returned an unexpected answer');

    const calls: UsageCall[] = [];
    for (const row of rows.data!) {
      const r = rawLogSchema.safeParse(row);
      if (!r.success) continue; // a row we do not understand is skipped, not fatal
      const start = new Date(r.data.startTime);
      if (Number.isNaN(start.getTime()) || start < since) continue;
      const end = r.data.endTime ? new Date(r.data.endTime) : null;
      const meta = r.data.metadata?.spend_logs_metadata;
      calls.push({
        id: r.data.request_id,
        time: start.toISOString(),
        operation: meta?.operation ?? null,
        // "openai/gpt-5.6-luna" is shown as "gpt-5.6-luna"
        model: (r.data.model ?? 'unknown').replace(/^[^/]+\//, ''),
        promptTokens: r.data.prompt_tokens ?? 0,
        completionTokens: r.data.completion_tokens ?? 0,
        costUsd: r.data.spend ?? 0,
        latencyMs:
          end && !Number.isNaN(end.getTime())
            ? Math.max(0, end.getTime() - start.getTime())
            : null,
        requestId: meta?.request_id ?? null,
      });
    }
    calls.sort((a, b) => b.time.localeCompare(a.time));
    return {
      calls: calls.slice(0, MAX_CALLS),
      truncated: calls.length > MAX_CALLS,
    };
  }

  /** The spending limit of the AI service key, or null if it cannot be read (the page then hides the budget). */
  async budgetUsd(): Promise<number | null> {
    const virtual = this.config.get('LITELLM_VIRTUAL_KEY', { infer: true });
    if (!virtual) return null;
    try {
      const body = (await this.get(
        `/key/info?key=${encodeURIComponent(virtual)}`,
      )) as { info?: { max_budget?: number | null } };
      const max = body.info?.max_budget;
      return typeof max === 'number' ? max : null;
    } catch {
      return null;
    }
  }

  private async get(path: string): Promise<unknown> {
    const master = this.config.get('LITELLM_MASTER_KEY', { infer: true });
    if (!master) this.unavailable('LiteLLM is not configured');
    const base = this.config.get('LITELLM_URL', { infer: true });
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${master}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      this.unavailable('LiteLLM did not answer');
    }
    if (!res!.ok) this.unavailable(`LiteLLM answered ${res!.status}`);
    return res!.json();
  }

  private unavailable(message: string): never {
    throw new ServiceUnavailableException({
      code: 'USAGE_UNAVAILABLE',
      message,
    });
  }
}
