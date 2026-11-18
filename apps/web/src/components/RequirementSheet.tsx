import { requirementNumber, type Requirement, type RequirementStatus } from '@copilot/contracts';
import { toast } from 'sonner';
import { TYPE_LABEL } from '@/components/analysis-labels';
import { Flags, PriorityLabel, StatusBadge } from '@/components/RequirementBadges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useUpdateRequirement } from '@/lib/analysis';

interface Props {
  projectId: string;
  requirement: Requirement | null;
  onClose: () => void;
  onEdit: (r: Requirement) => void;
  onOpenDocument: (documentId: string) => void;
}

/** One requirement with its evidence next to it, and the review decisions. */
export default function RequirementSheet({
  projectId,
  requirement: r,
  onClose,
  onEdit,
  onOpenDocument,
}: Props) {
  const update = useUpdateRequirement(projectId);

  async function setStatus(status: RequirementStatus) {
    if (!r) return;
    try {
      await update.mutateAsync({ id: r.id, status });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  }

  return (
    <Sheet open={r !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {r && (
          <>
            <SheetDescription>
              {requirementNumber(r.number)} · {TYPE_LABEL[r.type]}
            </SheetDescription>
            <SheetTitle>{r.title}</SheetTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={r.status} />
              <Flags r={r} />
              <Badge variant="outline">
                <PriorityLabel priority={r.priority} />
              </Badge>
              <Badge variant="outline">AI confidence: {r.confidence}</Badge>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
              <p>{r.description}</p>
              <section>
                <h3 className="mb-1.5 text-xs text-muted-foreground">Source</h3>
                {r.sources.length === 0 ? (
                  <p className="rounded-lg bg-warning-bg p-3 text-warning">
                    The AI did not point to a place in the documents. Check it before confirming.
                  </p>
                ) : (
                  r.sources.map((s) => (
                    <div key={`${s.documentId}-${s.quote}`} className="mb-3">
                      <blockquote
                        className={`rounded-r-lg border-l-[3px] px-3 py-2 ${
                          r.sourceUnverified
                            ? 'border-warning bg-warning-bg'
                            : 'border-primary bg-primary/10'
                        }`}
                      >
                        “{s.quote}”
                      </blockquote>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {s.documentName}
                        {s.page ? ` · page ${s.page}` : ''}{' '}
                        {r.sourceUnverified ? (
                          <b className="text-warning">· could not be matched exactly in the text</b>
                        ) : (
                          '· verified in the text'
                        )}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => onOpenDocument(s.documentId)}
                      >
                        Open in document
                      </Button>
                    </div>
                  ))
                )}
              </section>
              {r.aiComment && (
                <section>
                  <h3 className="mb-1.5 text-xs text-muted-foreground">AI note</h3>
                  <p className="text-muted-foreground">{r.aiComment}</p>
                </section>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => onEdit(r)} disabled={update.isPending}>
                Edit
              </Button>
              <span className="flex-1" />
              <Button
                variant="outline"
                onClick={() => setStatus('rejected')}
                disabled={update.isPending}
              >
                Reject
              </Button>
              <Button
                variant="outline"
                onClick={() => setStatus('needs_clarification')}
                disabled={update.isPending}
              >
                Needs clarification
              </Button>
              <Button onClick={() => setStatus('confirmed')} disabled={update.isPending}>
                Confirm
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
