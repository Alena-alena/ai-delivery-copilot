import type { Document, DocumentDetail } from '@copilot/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiBlob, apiDelete, apiGet, apiPost } from '@/lib/api';

export const documentKeys = {
  list: (projectId: string) => ['projects', projectId, 'documents'] as const,
  detail: (projectId: string, id: string) => ['projects', projectId, 'documents', id] as const,
};

/** A document still being worked on: the list keeps refreshing until none are left. */
const IN_PROGRESS = new Set<Document['status']>(['uploaded', 'extracting']);

export function useDocuments(projectId: string) {
  return useQuery({
    queryKey: documentKeys.list(projectId),
    queryFn: () => apiGet<Document[]>(`/projects/${projectId}/documents`),
    // Poll every 2 s while any document is non-terminal; stop when all are done or failed.
    refetchInterval: (query) =>
      query.state.data?.some((d) => IN_PROGRESS.has(d.status)) ? 2000 : false,
  });
}

export function useDocument(projectId: string, id: string | null) {
  return useQuery({
    queryKey: documentKeys.detail(projectId, id ?? ''),
    queryFn: () => apiGet<DocumentDetail>(`/projects/${projectId}/documents/${id}`),
    enabled: id !== null,
  });
}

export function useDeleteDocument(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${projectId}/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.list(projectId) }),
  });
}

export function useRetryDocument(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<Document>(`/projects/${projectId}/documents/${id}/retry`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.list(projectId) }),
  });
}

/** Fetches the original with the token and hands it to the browser as a download. */
export async function downloadDocument(projectId: string, doc: Document): Promise<void> {
  const blob = await apiBlob(`/projects/${projectId}/documents/${doc.id}/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.name;
  a.click();
  // Some browsers start the download asynchronously; revoking at once could cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
