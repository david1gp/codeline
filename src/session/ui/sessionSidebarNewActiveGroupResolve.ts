import type { SessionSidebarNewGroup } from "./sessionSidebarNewGroupsDerive.js"

export function sessionSidebarNewActiveGroupResolve<Session extends { id: string }>(
  groups: readonly SessionSidebarNewGroup<Session>[],
  selectedSessionId: string | null,
): string | null {
  if (selectedSessionId === null) return null
  return groups.find((group) => group.sessions.some((session) => session.id === selectedSessionId))?.id ?? null
}
