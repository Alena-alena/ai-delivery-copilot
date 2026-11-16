import type { Project } from '@copilot/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import DeleteProjectDialog from '@/components/DeleteProjectDialog';
import ProjectFormDialog from '@/components/ProjectFormDialog';
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
import { useProjects } from '@/lib/projects';

export default function ProjectsPage() {
  const { data, isPending, error, refetch } = useProjects();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Button onClick={() => setCreating(true)}>New project</Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : error ? (
        <Card>
          <CardContent className="flex items-center justify-between pt-6 text-sm">
            <span className="text-destructive">Could not load projects: {error.message}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="font-medium">No projects yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create a project for a client or product, then upload its documents to analyse them.
            </p>
            <Button onClick={() => setCreating(true)}>Create your first project</Button>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link className="underline-offset-4 hover:underline" to={`/projects/${p.id}`}>
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {p.description ?? '—'}
                </TableCell>
                <TableCell>{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleting(p)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ProjectFormDialog open={creating} onOpenChange={setCreating} />
      <ProjectFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        project={editing ?? undefined}
      />
      <DeleteProjectDialog project={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </div>
  );
}
