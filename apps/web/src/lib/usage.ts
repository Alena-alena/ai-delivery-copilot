import type { Usage, UsageRange } from '@copilot/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export function useUsage(range: UsageRange) {
  return useQuery({
    queryKey: ['usage', range],
    queryFn: () => apiGet<Usage>(`/usage?range=${range}`),
    // a missing LiteLLM is a final answer for now, not worth retrying
    retry: (count, error) => !(error as { status?: number }).status && count < 1,
  });
}

/** Costs are tiny: show enough digits to see them, but not 17 of them. */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  return usd < 0.01 ? `$${usd.toPrecision(2)}` : `$${usd.toFixed(4)}`;
}
