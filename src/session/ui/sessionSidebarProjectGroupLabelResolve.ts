type ProjectIdentity = { projectId?: string | null; projectPath: string }
type RegisteredProject = { projectId?: string | null; projectPath: string; projectLabel: string }

export function sessionSidebarProjectGroupLabelResolve(
  group: ProjectIdentity,
  projects: readonly RegisteredProject[],
  fallback: string,
): string {
  const match =
    group.projectId == null
      ? projects.find((project) => project.projectId == null && project.projectPath === group.projectPath)
      : projects.find((project) => project.projectId === group.projectId)
  return match?.projectLabel ?? fallback
}
