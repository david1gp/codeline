import type { ProjectRegistryApiProject } from "../../project/api/projectRegistryApiProjectSchema.js"

export function noteProjectLabelResolve(
  projects: readonly ProjectRegistryApiProject[],
  projectId: string | null,
  historicalProjectPath?: string | null,
): string {
  if (projectId === null) return "Unassigned"
  return projects.find((project) => project.id === projectId)?.label ?? historicalProjectPath ?? projectId
}
