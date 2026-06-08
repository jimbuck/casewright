import { z } from 'zod';

/** Optional `workspace.yaml` at a workspace root (PRD §5.1). */
export const WorkspaceYamlSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  displayIdPrefix: z.string().default(''),
  runsDir: z.string().default('runs'),
});

export type WorkspaceYaml = z.infer<typeof WorkspaceYamlSchema>;
