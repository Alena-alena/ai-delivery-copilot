import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SetupMessage() {
  return (
    <div className="mx-auto max-w-lg p-8">
      <Card>
        <CardHeader>
          <CardTitle>Supabase is not configured</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Add these two lines to the <code>.env</code> file in the project root, then restart the
            web app:
          </p>
          <pre className="rounded bg-muted p-3 text-xs">
            VITE_SUPABASE_URL=...{'\n'}VITE_SUPABASE_PUBLISHABLE_KEY=...
          </pre>
          <p>Both are on the Connect dialog of your Supabase project (Framework tab).</p>
        </CardContent>
      </Card>
    </div>
  );
}
