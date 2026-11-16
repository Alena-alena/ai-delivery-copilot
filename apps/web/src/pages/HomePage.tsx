import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';

interface Health {
  status: string;
}

export default function HomePage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<Health>('/health'),
  });

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>System status</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <span>API:</span>
        {isPending ? (
          <Badge variant="secondary">checking…</Badge>
        ) : error ? (
          <Badge variant="destructive">down</Badge>
        ) : (
          <Badge>{data.status}</Badge>
        )}
      </CardContent>
    </Card>
  );
}
