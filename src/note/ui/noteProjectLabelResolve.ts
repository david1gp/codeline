import type { ProjectApiListResponse } from "../../project/api/projectApiListResponseSchema.js"

export function noteProjectLabelResolve(
  projects: ProjectApiListResponse["projects"],
  projectPath: string | null,
): string {
  if (projectPath === null) return "Unassigned"
  return projects.find((project) => project.id === projectPath)?.label ?? projectPath
}
