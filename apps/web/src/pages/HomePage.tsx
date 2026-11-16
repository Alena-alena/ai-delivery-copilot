import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';

interface Health {
  status: string;
}

interface Me {
  id: string;
  email: string;
  displayName: string | null;
  workspaces: { id: string; name: string; role: string }[];
}

export default function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<Health>('/health'),
  });
  const me = useQuery({ queryKey: ['me'], queryFn: () => apiGet<Me>('/auth/me') });

  return (
    <div className="flex flex-col gap-4">
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {me.isPending ? (
            <Badge variant="secondary">loading…</Badge>
          ) : me.error ? (
            <Badge variant="destructive">{me.error.message}</Badge>
          ) : (
            <>
              <p>{me.data.email}</p>
              {me.data.workspaces.map((w) => (
                <p key={w.id} className="text-muted-foreground">
                  Workspace: {w.name} ({w.role})
                </p>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>System status</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <span>API:</span>
          {health.isPending ? (
            <Badge variant="secondary">checking…</Badge>
          ) : health.error ? (
            <Badge variant="destructive">down</Badge>
          ) : (
            <Badge>{health.data.status}</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
