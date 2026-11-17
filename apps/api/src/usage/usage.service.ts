import { Inject, Injectable } from '@nestjs/common';
import type { Usage, UsageRange } from '@copilot/contracts';
import { LitellmUsageClient } from './litellm-usage.client.js';

/** The start of the window. "today" is the start of the current UTC day. */
export function rangeStart(range: UsageRange, now = new Date()): Date {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (range === 'today') return startOfToday;
  const days = range === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 3600 * 1000);
}

@Injectable()
export class UsageService {
  constructor(
    @Inject(LitellmUsageClient) private readonly litellm: LitellmUsageClient,
  ) {}

  async get(range: UsageRange): Promise<Usage> {
    const [{ calls, truncated }, budgetUsd] = await Promise.all([
      this.litellm.calls(rangeStart(range)),
      this.litellm.budgetUsd(),
    ]);
    return {
      range,
      calls,
      totals: {
        costUsd: calls.reduce((a, c) => a + c.costUsd, 0),
        calls: calls.length,
        requests: new Set(calls.map((c) => c.requestId ?? c.id)).size,
        tokens: calls.reduce(
          (a, c) => a + c.promptTokens + c.completionTokens,
          0,
        ),
      },
      budgetUsd,
      truncated,
    };
  }
}
