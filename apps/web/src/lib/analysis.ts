import type {
  AnalysisOverview,
  AnalysisRun,
  ConfirmRequirementsInput,
  Requirement,
  UpdateRequirementInput,
} from '@copilot/contracts';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

export const analysisKeys = {
  overview: (projectId: string) => ['projects', projectId, 'analysis'] as const,
  requirements: (projectId: string) => ['projects', projectId, 'requirements'] as const,
};

const ACTIVE = new Set<AnalysisRun['status']>(['queued', 'running']);
export const isActive = (run: AnalysisRun | null | undefined) => !!run && ACTIVE.has(run.status);

/**
 * The overview query. It polls every 2 s while a run is queued or running, and when a poll sees the run
 * finish it also invalidates the requirements: they were saved by the worker, and the list on screen was
 * read before they existed.
 */
export function overviewQueryOptions(qc: QueryClient, projectId: string) {
  return {
    queryKey: analysisKeys.overview(projectId),
    queryFn: async () => {
      const before = qc.getQueryData<AnalysisOverview>(analysisKeys.overview(projectId))?.run;
      const next = await apiGet<AnalysisOverview>(`/projects/${projectId}/analysis`);
      if (isActive(before) && !isActive(next.run)) {
        void qc.invalidateQueries({ queryKey: analysisKeys.requirements(projectId) });
      }
      return next;
    },
    refetchInterval: (q: { state: { data?: AnalysisOverview } }) =>
      isActive(q.state.data?.run) ? 2000 : false,
  };
}

export function useAnalysis(projectId: string) {
  const qc = useQueryClient();
  return useQuery(overviewQueryOptions(qc, projectId));
}

export function useRequirements(projectId: string) {
  return useQuery({
    queryKey: analysisKeys.requirements(projectId),
    queryFn: () => apiGet<Requirement[]>(`/projects/${projectId}/requirements`),
  });
}

/** After a run finishes the list must be re-read; the overview poll tells us when. */
function useRefresh(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: analysisKeys.overview(projectId) }),
      qc.invalidateQueries({ queryKey: analysisKeys.requirements(projectId) }),
    ]);
}

export function useStartAnalysis(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: () => apiPost<AnalysisRun>(`/projects/${projectId}/analysis`, {}),
    onSuccess: refresh,
  });
}

export function useCancelAnalysis(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: () => apiPost<AnalysisRun>(`/projects/${projectId}/analysis/cancel`, {}),
    onSuccess: refresh,
  });
}

export function useUpdateRequirement(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateRequirementInput & { id: string }) =>
      apiPatch<Requirement>(`/projects/${projectId}/requirements/${id}`, input),
    // the answer is the new state of that one requirement: put it in the list without a refetch
    onSuccess: (updated) =>
      qc.setQueryData<Requirement[]>(analysisKeys.requirements(projectId), (list) =>
        list?.map((r) => (r.id === updated.id ? updated : r)),
      ),
  });
}

export function useConfirmRequirements(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmRequirementsInput) =>
      apiPost<Requirement[]>(`/projects/${projectId}/requirements/confirm`, input),
    onSuccess: (updated) =>
      qc.setQueryData<Requirement[]>(analysisKeys.requirements(projectId), (list) =>
        list?.map((r) => updated.find((u) => u.id === r.id) ?? r),
      ),
  });
}
