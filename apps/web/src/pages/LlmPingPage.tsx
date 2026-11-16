import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, apiPost } from '@/lib/api';

interface LlmPingResult {
  text: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number | null;
  latency_ms: number;
}

export default function LlmPingPage() {
  const [prompt, setPrompt] = useState('');
  const ping = useMutation({
    mutationFn: (p: string) => apiPost<LlmPingResult>('/dev/llm-ping', { prompt: p }),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold">LLM ping (dev)</h1>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ask something…"
        maxLength={4000}
      />
      <div>
        {/* disabled while pending: prevents a double submit from spending budget twice */}
        <Button onClick={() => ping.mutate(prompt)} disabled={!prompt.trim() || ping.isPending}>
          {ping.isPending ? 'Waiting…' : 'Send'}
        </Button>
      </div>

      {ping.error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {ping.error instanceof ApiError ? `${ping.error.body.code}: ` : ''}
            {ping.error.message}
          </CardContent>
        </Card>
      )}

      {ping.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Answer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="whitespace-pre-wrap">{ping.data.text}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-4">
              <div>
                <dt>Tokens in / out</dt>
                <dd>
                  {ping.data.prompt_tokens} / {ping.data.completion_tokens}
                </dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{ping.data.cost_usd === null ? '—' : `$${ping.data.cost_usd.toFixed(6)}`}</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>{Math.round(ping.data.latency_ms)} ms</dd>
              </div>
              <div>
                <dt>Model alias</dt>
                <dd>{ping.data.model}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
