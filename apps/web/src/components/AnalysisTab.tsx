import {
  analysisErrorMessage,
  requirementNumber,
  type AnalysisOverview,
  type AnalysisStep,
  type Gap,
  type Requirement,
  type RequirementStatus,
} from '@copilot/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { STATUS_LABEL, TYPE_LABEL } from '@/components/analysis-labels';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import GapsView from '@/components/GapsView';
import EditRequirementDialog from '@/components/EditRequirementDialog';
import { Flags, PriorityLabel, StatusBadge } from '@/components/RequirementBadges';
import RequirementSheet from '@/components/RequirementSheet';
import Segmented from '@/components/Segmented';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  isActive,
  useAnalysis,
  useCancelAnalysis,
  useConfirmRequirements,
  useGaps,
  useRequirements,
  useStartAnalysis,
} from '@/lib/analysis';
import { formatCost } from '@/lib/usage';
import { formatDateTime } from '@/lib/format';

type Filter = 'all' | RequirementStatus;

/** The Analysis tab of a project: run the analysis, follow it, review what the AI found. */
export default function AnalysisTab({ projectId }: { projectId: string }) {
  const overview = useAnalysis(projectId);
  const reqs = useRequirements(projectId);
  const gapsQuery = useGaps(projectId);
  const [confirmingRun, setConfirmingRun] = useState(false);

  if (overview.isPending || reqs.isPending || gapsQuery.isPending) return <Skeleton />;
  if (overview.error || reqs.error || gapsQuery.error) {
    const error = overview.error ?? reqs.error ?? gapsQuery.error!;
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="font-heading text-lg font-semibold text-destructive">
            Could not load the analysis
          </p>
          <p className="mt-1 text-muted-foreground">{error.message}</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              void overview.refetch();
              void reqs.refetch();
              void gapsQuery.refetch();
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { run } = overview.data;
  const list = reqs.data;
  const gaps = gapsQuery.data;
  const hasResults = list.length > 0 || gaps.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {isActive(run) ? (
        <Progress
          projectId={projectId}
          documents={overview.data.included.length}
          step={run?.step ?? 'requirements'}
        />
      ) : (
        <>
          {run?.status === 'failed' && (
            <FailedCard
              code={run.errorCode}
              hasEarlier={hasResults}
              onRetry={() => setConfirmingRun(true)}
            />
          )}
          {!hasResults && run?.status !== 'failed' && (
            <StartCard
              overview={overview.data}
              empty={run?.status === 'succeeded'}
              onRun={() => setConfirmingRun(true)}
            />
          )}
          {hasResults && (
            <Results
              projectId={projectId}
              list={list}
              gaps={gaps}
              overview={overview.data}
              onRun={() => setConfirmingRun(true)}
            />
          )}
        </>
      )}
      <RunDialog
        projectId={projectId}
        overview={overview.data}
        open={confirmingRun}
        again={hasResults}
        onClose={() => setConfirmingRun(false)}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-muted"
          style={{ width: `${92 - i * 10}%` }}
        />
      ))}
    </div>
  );
}

/** Before a run, or when a run found nothing. */
function StartCard({
  overview,
  empty,
  onRun,
}: {
  overview: AnalysisOverview;
  empty: boolean;
  onRun: () => void;
}) {
  const { included, excluded, estimate } = overview;
  if (empty) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p className="font-heading text-lg font-semibold text-foreground">
            No requirements found
          </p>
          The documents did not contain anything the AI could turn into a requirement. Add more
          documents, or check that the text was extracted correctly.
          <div className="mt-3">
            <Button variant="outline" onClick={onRun}>
              Run again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Analyse the documents of this project</h2>
        <p className="max-w-[60ch] text-muted-foreground">
          The AI reads every ready document and lists the requirements it finds, each with its
          source, and the gaps it spots, each with a question you can send to the client. You review
          everything; nothing is sent anywhere until you approve it.
        </p>
        {included.length > 0 ? (
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-xs text-muted-foreground">
              Included ({included.length} ready {included.length === 1 ? 'document' : 'documents'})
            </div>
            {included.map((d) => d.name).join(' · ')}
          </div>
        ) : (
          <p className="rounded-lg bg-warning-bg p-3 text-warning">
            No document is ready yet. Upload a document in the Documents tab and wait until it is
            Ready.
          </p>
        )}
        {excluded.length > 0 && (
          <div className="rounded-lg border border-warning p-3">
            <div className="mb-1 text-xs text-warning">Not included ({excluded.length})</div>
            {excluded.map((d) => (
              <p key={d.id}>
                {d.name}: <span className="text-muted-foreground">{d.reason}</span>
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onRun} disabled={included.length === 0}>
            Run analysis
          </Button>
          {included.length > 0 && (
            <span className="text-xs text-muted-foreground">
              About {estimate.tokens.toLocaleString()} tokens · estimated{' '}
              {formatCost(estimate.costUsd)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const STEPS: { key: AnalysisStep; label: string }[] = [
  { key: 'requirements', label: 'Requirements' },
  { key: 'gaps', label: 'Gaps' },
];

function Progress({
  projectId,
  documents,
  step,
}: {
  projectId: string;
  documents: number;
  step: AnalysisStep;
}) {
  const cancel = useCancelAnalysis(projectId);
  const [confirming, setConfirming] = useState(false);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Analysis is running</h2>
        <p className="text-muted-foreground">
          The AI is reading {documents} {documents === 1 ? 'document' : 'documents'}. You can leave
          this page; the analysis keeps running and the results appear here.
        </p>
        <ol className="flex flex-col gap-2.5" aria-label="Analysis steps">
          {STEPS.map((st, i) => {
            const current = STEPS.findIndex((x) => x.key === step);
            const state = i < current ? 'done' : i === current ? 'work' : 'wait';
            return (
              <li key={st.key} className="flex items-center gap-2.5">
                <span
                  className={
                    state === 'work'
                      ? 'inline-flex size-6 animate-pulse items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground'
                      : state === 'done'
                        ? 'inline-flex size-6 items-center justify-center rounded-full bg-success-bg text-xs font-bold text-success'
                        : 'inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground'
                  }
                >
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <b>{st.label}</b>
                <span className="text-muted-foreground">
                  {state === 'done' ? 'done' : state === 'work' ? 'reading…' : 'waiting'}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
        <div>
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Cancel analysis
          </Button>
        </div>
      </CardContent>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel the analysis?</DialogTitle>
            <DialogDescription>
              Nothing found so far is saved. You can run it again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep running
            </Button>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success('Analysis cancelled');
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel analysis'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function FailedCard({
  code,
  hasEarlier,
  onRetry,
}: {
  code: string | null;
  hasEarlier: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="border-destructive">
      <CardContent className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-destructive">The analysis did not finish</h2>
        <p className="text-muted-foreground">{analysisErrorMessage(code)}</p>
        <p>
          Nothing from this run was saved.
          {hasEarlier ? ' The results of earlier runs below are unchanged.' : ''}
        </p>
        <div>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RunDialog({
  projectId,
  overview,
  open,
  again,
  onClose,
}: {
  projectId: string;
  overview: AnalysisOverview;
  open: boolean;
  again: boolean;
  onClose: () => void;
}) {
  const start = useStartAnalysis(projectId);
  const { included, estimate } = overview;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{again ? 'Run the analysis again?' : 'Run the analysis?'}</DialogTitle>
          <DialogDescription>
            The AI will read {included.length} ready{' '}
            {included.length === 1 ? 'document' : 'documents'} (about{' '}
            {estimate.tokens.toLocaleString()} tokens) and cost about {formatCost(estimate.costUsd)}
            . You can leave the page while it runs.
          </DialogDescription>
        </DialogHeader>
        {again && (
          <p className="rounded-lg bg-muted p-3 text-muted-foreground">
            Your edits and every requirement you confirmed, rejected or marked for clarification are
            kept. New findings are added as AI suggestions.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={start.isPending}>
            Cancel
          </Button>
          {/* disabled while starting: prevents two runs on a double click */}
          <Button
            disabled={start.isPending || included.length === 0}
            onClick={() =>
              start.mutate(undefined, {
                onSuccess: () => {
                  onClose();
                  toast.success('Analysis started');
                },
                onError: (e) => {
                  onClose();
                  toast.error(e.message);
                },
              })
            }
          >
            {start.isPending ? 'Starting…' : 'Run analysis'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Results({
  projectId,
  list,
  gaps,
  overview,
  onRun,
}: {
  projectId: string;
  list: Requirement[];
  gaps: Gap[];
  overview: AnalysisOverview;
  onRun: () => void;
}) {
  const [part, setPart] = useState<'requirements' | 'gaps'>('requirements');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [viewDoc, setViewDoc] = useState<string | null>(null);
  const confirm = useConfirmRequirements(projectId);
  const { run } = overview;

  const count = (f: Filter) =>
    f === 'all' ? list.length : list.filter((r) => r.status === f).length;
  const rows = list.filter((r) => filter === 'all' || r.status === filter);
  const open = list.find((r) => r.id === openId) ?? null;
  const toReview = count('ai_suggested');
  const openGaps = gaps.filter((g) => g.status === 'open').length;
  const chosen = [...selected].filter((id) => list.some((r) => r.id === id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-1">
          <span>
            <b>
              {list.length} requirements · {gaps.length} {gaps.length === 1 ? 'gap' : 'gaps'}
            </b>
            {run?.status === 'succeeded' && (
              <span className="text-muted-foreground">
                {' '}
                · last run {formatDateTime(run.createdAt)} · cost {formatCost(run.costUsd)}
              </span>
            )}
          </span>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">
            Edited and confirmed items stay when you run again.
          </span>
          <Button variant="outline" size="sm" onClick={onRun}>
            Run again
          </Button>
        </CardContent>
      </Card>

      <Segmented<'requirements' | 'gaps'>
        label="Show"
        value={part}
        onChange={setPart}
        options={[
          {
            value: 'requirements',
            label: `Requirements ${list.length}${toReview > 0 ? ` · ${toReview} to review` : ''}`,
          },
          {
            value: 'gaps',
            label: `Gaps ${gaps.length}${openGaps > 0 ? ` · ${openGaps} open` : ''}`,
          },
        ]}
      />

      {part === 'gaps' ? (
        <GapsView
          projectId={projectId}
          gaps={gaps}
          existingNumbers={new Set(list.map((r) => r.number))}
          onOpenRequirement={(n) => {
            const r = list.find((x) => x.number === n);
            if (!r) return;
            setFilter('all');
            setPart('requirements');
            setOpenId(r.id);
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Filter>
              label="Status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All ${count('all')}` },
                ...(Object.keys(STATUS_LABEL) as RequirementStatus[]).map((s) => ({
                  value: s,
                  label: `${STATUS_LABEL[s]} ${count(s)}`,
                })),
              ]}
            />
            {chosen.length > 0 && (
              <>
                <span className="flex-1" />
                <span className="text-muted-foreground">{chosen.length} selected</span>
                <Button
                  size="sm"
                  disabled={confirm.isPending}
                  onClick={() =>
                    confirm.mutate(
                      { ids: chosen },
                      {
                        onSuccess: () => {
                          toast.success(`${chosen.length} confirmed`);
                          setSelected(new Set());
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  {confirm.isPending ? 'Confirming…' : 'Confirm selected'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Requirement</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Nothing with this status.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label={`Select ${requirementNumber(r.number)}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    <button
                      type="button"
                      className="text-left font-semibold hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenId(r.id);
                      }}
                    >
                      {r.title}
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {requirementNumber(r.number)}
                      <Flags r={r} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {TYPE_LABEL[r.type]}
                  </TableCell>
                  <TableCell>
                    <PriorityLabel priority={r.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="hidden max-w-[14rem] truncate text-xs text-muted-foreground lg:table-cell">
                    {r.sources[0]
                      ? `${r.sources[0].documentName}${r.sources[0].page ? ` · page ${r.sources[0].page}` : ''}`
                      : 'No source'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            AI suggestions are not facts. Confirm what is right, edit what is close, reject the
            rest. Only confirmed requirements become tasks.
          </p>
        </>
      )}

      <RequirementSheet
        projectId={projectId}
        requirement={open}
        onClose={() => setOpenId(null)}
        onEdit={(r) => setEditing(r)}
        onOpenDocument={(id) => setViewDoc(id)}
      />
      <EditRequirementDialog
        projectId={projectId}
        requirement={editing}
        onClose={() => setEditing(null)}
      />
      <DocumentViewerDialog
        projectId={projectId}
        documentId={viewDoc}
        onClose={() => setViewDoc(null)}
      />
    </>
  );
}
