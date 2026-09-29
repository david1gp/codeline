import type { SessionShell } from "../api/sessionShellSchema.js"

export type SessionSidebarNewGroup<Session> = {
  id: string
  label: string
  projectId: string | null
  projectPath: string
  sessions: Session[]
}

export function sessionSidebarNewGroupsDerive<Session extends Pick<SessionShell, "id" | "projectId" | "projectPath">>(
  sessions: readonly Session[],
): SessionSidebarNewGroup<Session>[] {
  const groups = new Map<string, SessionSidebarNewGroup<Session>>()
  for (const session of sessions) {
    const projectId = session.projectId ?? null
    const identity = projectId === null ? `path:${session.projectPath}` : `project:${projectId}`
    const group = groups.get(identity) ?? {
      id: identity,
      label: session.projectPath,
      projectId,
      projectPath: session.projectPath,
      sessions: [],
    }
    group.sessions.push(session)
    groups.set(identity, group)
  }
  return [...groups.values()]
}
