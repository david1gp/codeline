import type { ProjectRegistryApiProject } from "../../project/api/projectRegistryApiProjectSchema.js"
import { noteProjectLabelResolve } from "./noteProjectLabelResolve.js"

export function noteProjectChoicesResolve(
  projects: readonly ProjectRegistryApiProject[],
  currentProjectId: string | null,
  currentProjectPath?: string | null,
): readonly ProjectRegistryApiProject[] {
  const available = projects.filter((project) => project.available)
  if (currentProjectId === null || available.some((project) => project.id === currentProjectId)) {
    return available
  }
  const currentProject = projects.find((project) => project.id === currentProjectId)
  const choice: ProjectRegistryApiProject = currentProject ?? {
    available: false,
    id: currentProjectId,
    label: noteProjectLabelResolve(projects, currentProjectId, currentProjectPath),
  }
  return [choice, ...available]
}
