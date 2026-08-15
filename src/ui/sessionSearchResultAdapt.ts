import type { SessionSearchResponse } from "../session/schema/sessionSearchResponseSchema.js"
import type { SessionSidebarSession } from "./sessionSidebarSession.js"

export function sessionSearchResultAdapt(row: SessionSearchResponse["sessions"][number]): SessionSidebarSession {
  return {
    id: row.session.id,
    parentSessionId: row.session.parentSessionId ?? null,
    projectPath: row.session.projectPath ?? "~",
    title: row.session.title,
    updatedAt: row.session.updatedAt ?? 0,
    watched: row.session.watched ?? false,
  }
}
