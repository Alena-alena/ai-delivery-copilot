import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AnalysisTab from '@/components/AnalysisTab';
import DeleteProjectDialog from '@/components/DeleteProjectDialog';
import DocumentsTab from '@/components/DocumentsTab';
import ProjectFormDialog from '@/components/ProjectFormDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { useProject } from '@/lib/projects';

function ComingSoon({ phase, children }: { phase: string; children: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {children} Coming in {phase}.
      </CardContent>
    </Card>
  );
}

export default function ProjectPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: project, isPending, error } = useProject(id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading project…</p>;

  if (error) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{missing ? 'Project not found' : 'Could not load the project'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {missing ? 'It may have been deleted, or it is not yours.' : error.message}
          </p>
          <Button render={<Link to="/" />} variant="outline" size="sm" nativeButton={false}>
            Back to projects
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground">
            <Link to="/" className="underline-offset-4 hover:underline">
              Projects
            </Link>{' '}
            / {project.name}
          </p>
          <h1 className="mt-1.5 text-[26px] font-semibold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 max-w-2xl text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="outline" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="documents" className="gap-5">
        <TabsList variant="line" className="h-auto w-full justify-start border-b pb-0">
          <TabsTrigger className="flex-none px-3 py-2" value="documents">
            Documents
          </TabsTrigger>
          <TabsTrigger className="flex-none px-3 py-2" value="analysis">
            Analysis
          </TabsTrigger>
          <TabsTrigger className="flex-none px-3 py-2" value="tasks">
            Tasks
          </TabsTrigger>
          <TabsTrigger className="flex-none px-3 py-2" value="settings">
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="documents">
          <DocumentsTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="analysis">
          <AnalysisTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="tasks">
          <ComingSoon phase="phase 5">Review generated tasks and send them to Linear.</ComingSoon>
        </TabsContent>
        <TabsContent value="settings">
          <ComingSoon phase="a later phase">Project settings will appear here.</ComingSoon>
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={editing} onOpenChange={setEditing} project={project} />
      <DeleteProjectDialog
        project={deleting ? project : null}
        onOpenChange={(open) => !open && setDeleting(false)}
        onDeleted={() => navigate('/', { replace: true })}
      />
    </div>
  );
}
