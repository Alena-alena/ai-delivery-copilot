import {
  gapNumber,
  requirementNumber,
  type FindingStatus,
  type Gap,
  type GapSeverity,
  type GapType,
} from '@copilot/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { useUpdateGap } from '@/lib/analysis';

const TYPE_LABEL: Record<GapType, string> = {
  missing_information: 'Missing information',
  missing_requirement: 'Missing requirement',
  unclear_wording: 'Unclear wording',
};
const TYPE_ORDER: GapType[] = ['missing_information', 'missing_requirement', 'unclear_wording'];
const SEVERITY_LABEL: Record<GapSeverity, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const SEVERITY_VARIANT: Record<GapSeverity, 'destructive' | 'warning' | 'secondary'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
};

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('Could not copy. Select the text and copy it by hand.');
  }
}

/** Gaps grouped by type: what the documents do not say, each with a ready question for the client. */
export default function GapsView({
  projectId,
  gaps,
  existingNumbers,
  onOpenRequirement,
}: {
  projectId: string;
  gaps: Gap[];
  /** REQ numbers that still exist; a gap may point at a requirement that a re-run replaced. */
  existingNumbers: Set<number>;
  onOpenRequirement: (number: number) => void;
}) {
  const update = useUpdateGap(projectId);
  const [closing, setClosing] = useState<{ gap: Gap; to: 'resolved' | 'dismissed' } | null>(null);
  const open = gaps.filter((g) => g.status === 'open');

  if (gaps.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p className="font-heading text-lg font-semibold text-foreground">No gaps found</p>
          The AI did not find anything the documents leave out or say too vaguely.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="m-0 text-muted-foreground">
          What is missing or unclear in the documents, with a ready question for the client.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={open.length === 0}
          onClick={() =>
            void copy(
              open.map((g) => `${gapNumber(g.number)}: ${g.question}`).join('\n'),
              `${open.length} ${open.length === 1 ? 'question' : 'questions'} copied`,
            )
          }
        >
          Copy all open questions ({open.length})
        </Button>
      </div>

      {TYPE_ORDER.map((type) => {
        const group = gaps.filter((g) => g.type === type);
        if (group.length === 0) return null;
        return (
          <section key={type} className="flex flex-col gap-3">
            <h3 className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {TYPE_LABEL[type]}
            </h3>
            {group.map((g) => (
              <GapCard
                key={g.id}
                gap={g}
                existingNumbers={existingNumbers}
                busy={update.isPending}
                onOpenRequirement={onOpenRequirement}
                onClose={(to) => setClosing({ gap: g, to })}
                onReopen={() =>
                  update.mutate(
                    { id: g.id, status: 'open' },
                    { onError: (e) => toast.error(e.message) },
                  )
                }
              />
            ))}
          </section>
        );
      })}

      <CloseDialog projectId={projectId} target={closing} onDone={() => setClosing(null)} />
    </>
  );
}

function GapCard({
  gap: g,
  existingNumbers,
  busy,
  onOpenRequirement,
  onClose,
  onReopen,
}: {
  gap: Gap;
  existingNumbers: Set<number>;
  busy: boolean;
  onOpenRequirement: (number: number) => void;
  onClose: (to: 'resolved' | 'dismissed') => void;
  onReopen: () => void;
}) {
  const isOpen = g.status === 'open';
  const links = g.requirementNumbers.filter((n) => existingNumbers.has(n));
  return (
    <Card className={isOpen ? undefined : 'opacity-75'}>
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={SEVERITY_VARIANT[g.severity]}>{SEVERITY_LABEL[g.severity]}</Badge>
          <span className="text-xs text-muted-foreground">{gapNumber(g.number)}</span>
          {!isOpen && (
            <Badge variant={g.status === 'resolved' ? 'success' : 'secondary'}>
              {g.status === 'resolved' ? 'Resolved' : 'Dismissed'}
            </Badge>
          )}
          <span className="flex-1" />
          {isOpen ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onClose('resolved')}
              >
                Resolve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onClose('dismissed')}
              >
                Dismiss
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onReopen}>
              Reopen
            </Button>
          )}
        </div>
        <p className="m-0">{g.text}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {links.length > 0 ? (
            links.map((n) => (
              <button
                key={n}
                type="button"
                className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-primary hover:underline"
                onClick={() => onOpenRequirement(n)}
              >
                {requirementNumber(n)}
              </button>
            ))
          ) : (
            <Badge variant="warning">Absent from the documents</Badge>
          )}
        </div>
        <div className="rounded-lg bg-muted p-3">
          <div className="text-xs text-muted-foreground">Question for the client</div>
          <div className="mt-1 flex items-start gap-2.5">
            <p className="m-0 flex-1">{g.question}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy(g.question, 'Question copied')}
            >
              Copy
            </Button>
          </div>
        </div>
        {g.note && <p className="m-0 text-xs text-muted-foreground">Note: {g.note}</p>}
      </CardContent>
    </Card>
  );
}

function CloseDialog({
  projectId,
  target,
  onDone,
}: {
  projectId: string;
  target: { gap: Gap; to: Exclude<FindingStatus, 'open'> } | null;
  onDone: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        {/* the form lives inside the content, so the comment starts empty every time */}
        {target && <CloseForm projectId={projectId} target={target} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function CloseForm({
  projectId,
  target,
  onDone,
}: {
  projectId: string;
  target: { gap: Gap; to: Exclude<FindingStatus, 'open'> };
  onDone: () => void;
}) {
  const update = useUpdateGap(projectId);
  const [note, setNote] = useState('');
  const resolving = target.to === 'resolved';
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(
          { id: target.gap.id, status: target.to, note },
          {
            onSuccess: () => {
              toast.success(resolving ? 'Marked as resolved' : 'Dismissed');
              onDone();
            },
            onError: (err) => toast.error(err.message),
          },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>{resolving ? 'Mark as resolved' : 'Dismiss this finding'}</DialogTitle>
        <DialogDescription>{target.gap.text}</DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Comment (optional)
        <Textarea
          value={note}
          maxLength={2000}
          placeholder={resolving ? 'What was decided?' : 'Why is this not a problem?'}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : resolving ? 'Resolve' : 'Dismiss'}
        </Button>
      </DialogFooter>
    </form>
  );
}
