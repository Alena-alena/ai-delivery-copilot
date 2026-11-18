import { requirementNumber, type Priority, type Requirement } from '@copilot/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { PRIORITY_LABEL } from '@/components/analysis-labels';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateRequirement } from '@/lib/analysis';

interface Props {
  projectId: string;
  requirement: Requirement | null;
  onClose: () => void;
}

export default function EditRequirementDialog({ projectId, requirement, onClose }: Props) {
  return (
    <Dialog open={requirement !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {/* the form lives inside the content, so it starts fresh from the current values every time */}
        {requirement && (
          <EditForm projectId={projectId} requirement={requirement} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  projectId,
  requirement,
  onDone,
}: {
  projectId: string;
  requirement: Requirement;
  onDone: () => void;
}) {
  const update = useUpdateRequirement(projectId);
  const [title, setTitle] = useState(requirement.title);
  const [description, setDescription] = useState(requirement.description);
  const [priority, setPriority] = useState<Priority>(requirement.priority);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Enter a title');
    setError(null);
    try {
      await update.mutateAsync({ id: requirement.id, title, description, priority });
      toast.success(`${requirementNumber(requirement.number)} updated`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <DialogHeader>
        <DialogTitle>Edit {requirementNumber(requirement.number)}</DialogTitle>
        <DialogDescription>
          The source quote cannot be changed. Your edit is marked as Edited.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="my-4">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="req-title">Title</FieldLabel>
          <Input
            id="req-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          {error && <FieldError errors={[{ message: error }]} />}
        </Field>
        <Field>
          <FieldLabel htmlFor="req-description">Description</FieldLabel>
          <Textarea
            id="req-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="req-priority">Priority</FieldLabel>
          <select
            id="req-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        {/* disabled while saving: prevents saving twice on a double click */}
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
