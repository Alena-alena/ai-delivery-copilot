import { USAGE_RANGES, type UsageRange } from '@copilot/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCost, useUsage } from '@/lib/usage';
import { cn } from '@/lib/utils';

const RANGE_LABEL: Record<UsageRange, string> = {
  '30d': '30 days',
  '7d': '7 days',
  today: 'Today',
};
const RANGE_TITLE: Record<UsageRange, string> = {
  '30d': 'Spent, last 30 days',
  '7d': 'Spent, last 7 days',
  today: 'Spent today',
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px]"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs transition-colors',
            o.value === value
              ? 'bg-card font-semibold text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stat({
  title,
  value,
  note,
  children,
}: {
  title: string;
  value: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className="font-heading text-[26px] leading-none font-semibold">{value}</span>
        <span className="text-muted-foreground">{note}</span>
        {children}
      </CardContent>
    </Card>
  );
}

export default function UsagePage() {
  const [range, setRange] = useState<UsageRange>('30d');
  const [group, setGroup] = useState('all');
  const { data, isPending, error, refetch } = useUsage(range);

  // "analysis.requirements" belongs to the group "analysis"
  const groupOf = (op: string | null) => (op ? op.split('.')[0]! : 'other');
  const groups = data ? [...new Set(data.calls.map((c) => groupOf(c.operation)))].sort() : [];
  const calls = data
    ? data.calls.filter((c) => group === 'all' || groupOf(c.operation) === group)
    : [];
  const shownGroup = group === 'all' || groups.includes(group) ? group : 'all';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold">Usage</h1>
        <p className="mt-1 text-muted-foreground">Every AI call with its tokens and cost.</p>
      </div>

      {isPending ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="flex flex-col gap-2">
                  <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
                  <div className="h-6 w-3/5 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: `${92 - i * 10}%` }}
              />
            ))}
          </div>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="font-heading text-lg font-semibold text-destructive">
              Could not load usage
            </p>
            <p className="mt-1 text-muted-foreground">{error.message}</p>
            <Button variant="outline" className="mt-3" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              title={RANGE_TITLE[range]}
              value={formatCost(data.totals.costUsd)}
              note={
                data.budgetUsd !== null
                  ? `of $${data.budgetUsd.toFixed(2)} budget`
                  : 'budget unknown'
              }
            >
              {data.budgetUsd !== null && data.budgetUsd > 0 && (
                <div
                  role="progressbar"
                  aria-label="Share of the budget spent"
                  aria-valuenow={Math.min(
                    100,
                    Math.round((data.totals.costUsd / data.budgetUsd) * 100),
                  )}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, Math.max(1, (data.totals.costUsd / data.budgetUsd) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </Stat>
            <Stat
              title="AI calls"
              value={data.totals.calls.toLocaleString()}
              note={`${data.totals.requests.toLocaleString()} requests`}
            />
            <Stat
              title="Tokens"
              value={data.totals.tokens.toLocaleString()}
              note="input + output"
            />
          </div>

          {data.calls.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p className="font-heading text-lg font-semibold text-foreground">
                  No AI calls yet
                </p>
                Calls appear here after the first analysis runs.
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Segmented
              label="Time range"
              value={range}
              onChange={setRange}
              options={USAGE_RANGES.slice()
                .reverse()
                .map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
            />
            {groups.length > 0 && (
              <Segmented
                label="Operation"
                value={shownGroup}
                onChange={setGroup}
                options={[
                  { value: 'all', label: 'All operations' },
                  ...groups.map((g) => ({ value: g, label: g })),
                ]}
              />
            )}
          </div>

          {calls.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead className="hidden md:table-cell">Model</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Input</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Output</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Latency</TableHead>
                  <TableHead className="hidden lg:table-cell">Request</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(c.time).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell className="font-semibold">{c.operation ?? '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {c.model}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono md:table-cell">
                      {c.promptTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono md:table-cell">
                      {c.completionTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCost(c.costUsd)}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                      {c.latencyMs === null ? '—' : `${(c.latencyMs / 1000).toFixed(1)} s`}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                      {c.requestId ? c.requestId.slice(0, 8) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {data.truncated && (
            <p className="text-xs text-muted-foreground">
              Only the newest calls are listed. Totals cover the listed calls.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Prompts and answers are not stored: client documents stay confidential. Cost comes from
            LiteLLM and may lag by about a minute.
          </p>
        </>
      )}
    </div>
  );
}
