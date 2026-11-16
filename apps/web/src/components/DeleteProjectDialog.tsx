import type { Project } from '@copilot/contracts';
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
import { useDeleteProject } from '@/lib/projects';

interface Props {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export default function DeleteProjectDialog({ project, onOpenChange, onDeleted }: Props) {
  const del = useDeleteProject();
  // Keep the last name while the dialog animates closed, so the title does not flash empty.
  const [shown, setShown] = useState(project);
  if (project && project !== shown) setShown(project);

  async function confirm() {
    if (!project) return;
    try {
      await del.mutateAsync(project.id);
      toast.success('Project deleted');
      onOpenChange(false);
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the project');
    }
  }

  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{shown?.name}”?</DialogTitle>
          <DialogDescription>
            The project and everything in it will be deleted. This cannot be undone.
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
