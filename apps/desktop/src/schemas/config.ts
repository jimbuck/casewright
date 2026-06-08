import { z } from 'zod';

/** `casewright.json` at the repo root — declares where workspaces live (PRD §5.1). */
export const RootConfigSchema = z.object({
  workspaces: z.array(z.string()).default([]),
});

export type RootConfig = z.infer<typeof RootConfigSchema>;
