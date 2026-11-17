import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDocument } from '@/lib/documents';

interface Props {
  projectId: string;
  documentId: string | null;
  onClose: () => void;
}

/** The extracted text, segment by segment, with the page each one came from. */
export default function DocumentViewerDialog({ projectId, documentId, onClose }: Props) {
  const { data, isPending, error } = useDocument(projectId, documentId);

  return (
    <Dialog open={documentId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{data?.name ?? 'Document text'}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.segments.length} segments · ${data.tokenCount?.toLocaleString() ?? 0} tokens`
              : 'Extracted text'}
          </DialogDescription>
        </DialogHeader>
        {/* Only this part scrolls; the title above stays in place. */}
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading text…</p>
          ) : error ? (
            <p className="text-sm text-destructive">Could not load the text: {error.message}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {data.segments.map((s) => (
                <li key={s.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 text-xs text-muted-foreground">
                    Segment {s.index + 1}
                    {s.page ? ` · page ${s.page}` : ''}
                  </div>
                  <p className="whitespace-pre-wrap">{s.text}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
