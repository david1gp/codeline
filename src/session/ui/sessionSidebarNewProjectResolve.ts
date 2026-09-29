import type { SessionSidebarProjectGroup } from "./sessionSidebarDerive.js"

/** Registry identity takes precedence; path-only groups must never borrow registered actions. */
export function sessionSidebarNewProjectResolve(
  group: { projectId: string | null; projectPath: string },
  projects: readonly SessionSidebarProjectGroup[],
): { project: SessionSidebarProjectGroup; canDeleteByPath: boolean } | null {
  const project = projects.find((candidate) =>
    group.projectId === null
      ? candidate.projectId === undefined && candidate.projectPath === group.projectPath
      : candidate.projectId === group.projectId,
  )
  if (project === undefined) return null
  return {
    project,
    canDeleteByPath:
      group.projectId === null &&
      !projects.some((candidate) => candidate !== project && candidate.projectPath === group.projectPath),
  }
}
