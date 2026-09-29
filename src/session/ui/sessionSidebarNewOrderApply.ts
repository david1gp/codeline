import type { SessionShell } from "../api/sessionShellSchema.js"

export function sessionSidebarNewOrderApply<Session extends Pick<SessionShell, "id">>(
  sessions: readonly Session[],
  savedOrder: readonly string[],
): Session[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const ordered: Session[] = []
  const included = new Set<string>()
  for (const id of savedOrder) {
    const session = sessionById.get(id)
    if (session === undefined || included.has(id)) continue
    ordered.push(session)
    included.add(id)
  }
  for (const session of sessions) {
    if (included.has(session.id)) continue
    ordered.push(session)
    included.add(session.id)
  }
  return ordered
}
