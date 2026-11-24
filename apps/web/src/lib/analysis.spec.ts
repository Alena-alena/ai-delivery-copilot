import type { AnalysisOverview, AnalysisRun } from '@copilot/contracts';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiGet, apiPost: vi.fn(), apiPatch: vi.fn() }));

import { analysisKeys, isActive, overviewQueryOptions } from './analysis';

const run = (status: AnalysisRun['status']): AnalysisRun => ({
  id: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  status,
  promptVersion: null,
  model: null,
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
  requirementsFound: 0,
  gapsFound: 0,
  step: null,
  documentCount: 1,
  errorCode: null,
  createdAt: '2026-11-18T10:00:00.000Z',
  finishedAt: null,
});
const overview = (status: AnalysisRun['status'] | null): AnalysisOverview => ({
  run: status ? run(status) : null,
  included: [],
  excluded: [],
  estimate: { tokens: 0, costUsd: 0 },
});

const PID = '22222222-2222-4222-8222-222222222222';
let qc: QueryClient;
beforeEach(() => {
  apiGet.mockReset();
  qc = new QueryClient();
  // the requirements list as it was read while the run was still going: empty
  qc.setQueryData(analysisKeys.requirements(PID), []);
});

const stale = () => qc.getQueryState(analysisKeys.requirements(PID))?.isInvalidated;

describe('overview polling', () => {
  it('re-reads the requirements when a poll sees the run finish', async () => {
    qc.setQueryData(analysisKeys.overview(PID), overview('running'));
    apiGet.mockResolvedValue(overview('succeeded'));
    await overviewQueryOptions(qc, PID).queryFn();
    expect(stale()).toBe(true);
  });

  it('does so for a failed or cancelled run too (the list may have changed or be shown differently)', async () => {
    for (const status of ['failed', 'cancelled'] as const) {
      qc.setQueryData(analysisKeys.requirements(PID), []);
      qc.setQueryData(analysisKeys.overview(PID), overview('queued'));
      apiGet.mockResolvedValue(overview(status));
      await overviewQueryOptions(qc, PID).queryFn();
      expect(stale(), status).toBe(true);
    }
  });

  it('leaves the list alone while the run is still active or when nothing changed', async () => {
    qc.setQueryData(analysisKeys.overview(PID), overview('running'));
    apiGet.mockResolvedValue(overview('running'));
    await overviewQueryOptions(qc, PID).queryFn();
    expect(stale()).toBeFalsy();

    qc.setQueryData(analysisKeys.overview(PID), overview('succeeded'));
    apiGet.mockResolvedValue(overview('succeeded'));
    await overviewQueryOptions(qc, PID).queryFn();
    expect(stale()).toBeFalsy();
  });

  it('polls every 2 s only while a run is active', () => {
    const { refetchInterval } = overviewQueryOptions(qc, PID);
    expect(refetchInterval({ state: { data: overview('running') } })).toBe(2000);
    expect(refetchInterval({ state: { data: overview('queued') } })).toBe(2000);
    expect(refetchInterval({ state: { data: overview('succeeded') } })).toBe(false);
    expect(refetchInterval({ state: { data: overview(null) } })).toBe(false);
    expect(isActive(null)).toBe(false);
  });
});
