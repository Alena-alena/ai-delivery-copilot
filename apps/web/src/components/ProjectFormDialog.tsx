import { createProjectSchema, type CreateProjectInput, type Project } from '@copilot/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateProject, useUpdateProject } from '@/lib/projects';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present: edit this project. Absent: create a new one. */
  project?: Project;
}

export default function ProjectFormDialog({ open, onOpenChange, project }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The form lives inside the dialog content, so it starts fresh every time the dialog opens. */}
        <ProjectForm project={project} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: project?.name ?? '', description: project?.description ?? '' },
  });
  const pending = create.isPending || update.isPending;

  async function onSubmit(values: CreateProjectInput) {
    try {
      if (project) await update.mutateAsync(values);
      else await create.mutateAsync(values);
      toast.success(project ? 'Project updated' : 'Project created');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the project');
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <DialogHeader>
        <DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle>
        <DialogDescription>
          {project
            ? 'Change the name or description.'
            : 'A project holds the documents of one client or product.'}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="my-4">
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="project-name">Name</FieldLabel>
              <Input {...field} id="project-name" autoFocus />
              {fieldState.error && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="description"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="project-description">Description (optional)</FieldLabel>
              <Textarea {...field} value={field.value ?? ''} id="project-description" />
              {fieldState.error && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        {/* disabled while saving: prevents creating the project twice on a double click */}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : project ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
