import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export interface Me {
  id: string;
  email: string;
  displayName: string | null;
  workspaces: { id: string; name: string; role: string }[];
  /** May open pages that show data across all users (Usage). The API enforces it too. */
  isOperator: boolean;
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => apiGet<Me>('/auth/me') });
}
