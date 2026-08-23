import type { SessionShell } from "../session/api/sessionShellSchema.js"
import type { SessionSidebarSession } from "./sessionSidebarSession.js"

export function sessionSearchResultAdapt(session: SessionShell): SessionSidebarSession {
  return {
    id: session.id,
    parentSessionId: session.parentSessionId,
    projectPath: session.projectPath,
    title: session.title,
    updatedAt: session.updatedAt,
    pinned: session.pinned,
    working: false,
  }
}
