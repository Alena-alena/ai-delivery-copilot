import { z } from 'zod';

export const PROJECT_NAME_MAX = 100;
export const PROJECT_DESCRIPTION_MAX = 2000;

const name = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(PROJECT_NAME_MAX, `At most ${PROJECT_NAME_MAX} characters`);

// An empty or missing description means "no description"; the API stores it as null.
const description = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX, `At most ${PROJECT_DESCRIPTION_MAX} characters`)
  .nullish();

/** POST /api/projects. The form in the web app and the API validate with this same schema. */
export const createProjectSchema = z.object({ name, description });

/** PATCH /api/projects/:id. Any subset of the fields, but not an empty object. */
export const updateProjectSchema = createProjectSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });

/** What the API returns for a project. Dates are ISO strings. */
export const projectSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type Project = z.infer<typeof projectSchema>;
