import {
  documentErrorMessage,
  isRetryableDocumentError,
  uploadFileSchema,
  type Document,
} from '@copilot/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import DeleteDocumentDialog from '@/components/DeleteDocumentDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import { Badge } from '@/components/ui/badge';
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
import { apiUpload } from '@/lib/api';
import { documentKeys, downloadDocument, useDocuments, useRetryDocument } from '@/lib/documents';
import { uploadErrorMessage } from '@/lib/upload-errors';

interface PendingUpload {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

const STATUS_LABEL: Record<Document['status'], string> = {
  uploaded: 'Queued',
  extracting: 'Extracting text…',
  extracted: 'Ready',
  extraction_failed: 'Failed',
};

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: Document['status'] }) {
  return (
    <Badge
      variant={
        status === 'extraction_failed'
          ? 'destructive'
          : status === 'extracted'
            ? 'success'
            : status === 'extracting'
              ? 'warning'
              : 'secondary'
      }
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full bg-current ${status === 'extracting' ? 'animate-pulse' : ''}`}
      />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export default function DocumentsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useDocuments(projectId);
  const retry = useRetryDocument(projectId);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Document | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: string, change: Partial<PendingUpload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...change } : u)));

  async function uploadOne(file: File) {
    const key = `${file.name}-${crypto.randomUUID()}`;
    // The same schema the API uses: obvious problems are caught before any bytes are sent.
    const check = uploadFileSchema.safeParse({ name: file.name, size: file.size });
    if (!check.success) {
      setUploads((l) => [
        ...l,
        { key, name: file.name, progress: 0, error: check.error.issues[0]?.message },
      ]);
      return;
    }
    setUploads((l) => [...l, { key, name: file.name, progress: 0 }]);
    try {
      await apiUpload<Document>(`/projects/${projectId}/documents`, file, (f) =>
        patch(key, { progress: f }),
      );
      setUploads((l) => l.filter((u) => u.key !== key));
      await qc.invalidateQueries({ queryKey: documentKeys.list(projectId) });
    } catch (e) {
      patch(key, { error: uploadErrorMessage(e) });
    }
  }

  function addFiles(files: FileList | File[]) {
    // All files go up at once.
    void Promise.all(Array.from(files).map(uploadOne));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed p-6 text-center transition-colors ${
          dragging ? 'border-primary bg-muted' : 'border-border bg-card'
        }`}
      >
        <p className="font-semibold">Drop PDF, DOCX or TXT files here</p>
        <p className="text-sm text-muted-foreground">
          Up to 10 MB each. Text is extracted automatically.
        </p>
        <Button variant="outline" onClick={() => input.current?.click()}>
          Choose files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = ''; // lets the same file be chosen again
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Uploads in progress">
          {uploads.map((u) => (
            <li
              key={u.key}
              className={`rounded-lg p-3 text-sm ${u.error ? 'bg-warning-bg text-warning' : 'border bg-card'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{u.name}</span>
                {u.error ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploads((l) => l.filter((x) => x.key !== u.key))}
                  >
                    Dismiss
                  </Button>
                ) : (
                  <span className="text-muted-foreground">{Math.round(u.progress * 100)}%</span>
                )}
              </div>
              {u.error ? (
                <p role="alert" className="mt-1">
                  {u.error}
                </p>
              ) : (
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${u.progress * 100}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isPending ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: `${90 - i * 12}%` }}
            />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex items-center justify-between pt-6 text-sm">
            <span className="text-destructive">Could not load documents: {error.message}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p className="font-heading text-lg font-semibold text-foreground">No documents yet</p>
            Drop a PDF, DOCX or TXT above. Text is extracted automatically.
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Text</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="max-w-xs">
                  <div className="truncate font-semibold">{d.name}</div>
                  {d.status === 'extraction_failed' && (
                    <p className="mt-1 whitespace-normal text-xs text-destructive">
                      {documentErrorMessage(d.errorCode)}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={d.status} />
                </TableCell>
                <TableCell>{formatSize(d.size)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {d.status === 'extracted'
                    ? `${d.pageCount ? `${d.pageCount} pages · ` : ''}${d.tokenCount?.toLocaleString()} tokens`
                    : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    {d.status === 'extracted' && (
                      <Button variant="outline" size="sm" onClick={() => setViewing(d.id)}>
                        View text
                      </Button>
                    )}
                    {d.status === 'extraction_failed' && isRetryableDocumentError(d.errorCode) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={retry.isPending}
                        onClick={() =>
                          retry.mutate(d.id, {
                            onError: (e) => toast.error(e.message),
                          })
                        }
                      >
                        Try again
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadDocument(projectId, d).catch((e: Error) => toast.error(e.message))
                      }
                    >
                      Download
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(d)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DocumentViewerDialog
        projectId={projectId}
        documentId={viewing}
        onClose={() => setViewing(null)}
      />
      <DeleteDocumentDialog
        projectId={projectId}
        document={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  );
}
