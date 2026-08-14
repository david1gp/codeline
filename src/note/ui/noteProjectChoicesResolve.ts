import type { ProjectApiListResponse } from "../../project/api/projectApiListResponseSchema.js"
import { noteProjectLabelResolve } from "./noteProjectLabelResolve.js"

export function noteProjectChoicesResolve(
  projects: ProjectApiListResponse["projects"],
  currentProjectId: string | null,
): ProjectApiListResponse["projects"] {
  if (currentProjectId === null || projects.some((project) => project.id === currentProjectId)) return projects
  return [{ id: currentProjectId, label: noteProjectLabelResolve(projects, currentProjectId) }, ...projects]
}
