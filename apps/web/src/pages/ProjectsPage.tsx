import type { Project } from '@copilot/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import DeleteProjectDialog from '@/components/DeleteProjectDialog';
import ProjectFormDialog from '@/components/ProjectFormDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useProjects } from '@/lib/projects';
import { formatDate } from '@/lib/format';

export default function ProjectsPage() {
  const { data, isPending, error, refetch } = useProjects();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold">Projects</h1>
          <p className="mt-1 text-muted-foreground">
            Each project is one set of documents to analyse.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New project</Button>
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-2">
                <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
                <div className="h-3.5 w-11/12 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
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
            <p className="font-heading text-lg font-semibold">No projects yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create a project for a client or product, then upload its documents to analyse them.
            </p>
            <Button onClick={() => setCreating(true)}>Create your first project</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Card key={p.id} className="transition-colors hover:border-primary">
              <CardContent className="flex flex-col gap-1.5">
                <Link
                  to={`/projects/${p.id}`}
                  className="font-heading text-lg font-semibold underline-offset-4 hover:underline"
                >
                  {p.name}
                </Link>
                <p className="line-clamp-2 min-h-10 text-muted-foreground">
                  {p.description ?? 'No description'}
                </p>
                <p className="text-xs text-muted-foreground">Updated {formatDate(p.updatedAt)}</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(p)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
