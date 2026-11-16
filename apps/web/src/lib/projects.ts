import type { CreateProjectInput, Project, UpdateProjectInput } from '@copilot/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';

/** ['projects'] is the list; ['projects', id] is one project. Invalidating the first also covers the second. */
export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => apiGet<Project[]>('/projects'),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => apiGet<Project>(`/projects/${id}`),
    // a missing or foreign project is a final answer, not worth retrying
    retry: (count, error) => !(error as { status?: number }).status && count < 1,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => apiPost<Project>('/projects', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => apiPatch<Project>(`/projects/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${id}`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: projectKeys.detail(id) });
      return qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
