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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.name ?? 'Document text'}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.segments.length} segments · ${data.tokenCount?.toLocaleString() ?? 0} tokens`
              : 'Extracted text'}
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
