import type { SessionSidebarTab } from "../sessionSidebarTab.js"
import { pageRouteWorkspace } from "./pageRouteWorkspace.js"

function workspaceSearchResolve(tab?: SessionSidebarTab): string {
  if (tab === undefined) return ""
  return `?tab=${encodeURIComponent(tab)}`
}

export function urlSessions(options?: { tab?: SessionSidebarTab }): string {
  return `${pageRouteWorkspace.sessions}${workspaceSearchResolve(options?.tab)}`
}

export function urlSessionsNew(options?: { tab?: SessionSidebarTab }): string {
  return `${pageRouteWorkspace.sessionsNew}${workspaceSearchResolve(options?.tab)}`
}

export function urlSessionDetail(sessionId: string, options?: { tab?: SessionSidebarTab }): string {
  return `${pageRouteWorkspace.sessionDetail.replace(":sessionId", encodeURIComponent(sessionId))}${workspaceSearchResolve(options?.tab)}`
}

export const urlWorkspace = {
  sessions: urlSessions,
  sessionsNew: urlSessionsNew,
  sessionDetail: urlSessionDetail,
}
