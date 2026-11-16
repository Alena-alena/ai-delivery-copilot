import type { Document } from '@copilot/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeleteDocument } from '@/lib/documents';

interface Props {
  projectId: string;
  document: Document | null;
  onOpenChange: (open: boolean) => void;
}

export default function DeleteDocumentDialog({ projectId, document, onOpenChange }: Props) {
  const del = useDeleteDocument(projectId);
  // Keep the last name while the dialog animates closed, so the title does not flash empty.
  const [shown, setShown] = useState(document);
  if (document && document !== shown) setShown(document);

  async function confirm() {
    if (!document) return;
    try {
      await del.mutateAsync(document.id);
      toast.success('Document deleted');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the document');
    }
  }

  return (
    <Dialog open={document !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{shown?.name}”?</DialogTitle>
          <DialogDescription>
            The file and its extracted text will be deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={del.isPending}>
            {del.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
