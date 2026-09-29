import type { SessionSidebarTab } from "../../session/ui/sessionSidebarTab.js"
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

export function urlSessionsLegacy(options?: { tab?: SessionSidebarTab }): string {
  return `${pageRouteWorkspace.sessionsLegacy}${workspaceSearchResolve(options?.tab)}`
}

export function urlSessionsLegacyNew(options?: { tab?: SessionSidebarTab }): string {
  return `${pageRouteWorkspace.sessionsLegacyNew}${workspaceSearchResolve(options?.tab)}`
}

export function urlSessionLegacyDetail(sessionId: string, options?: { tab?: SessionSidebarTab }): string {
  return `${pageRouteWorkspace.sessionLegacyDetail.replace(":sessionId", encodeURIComponent(sessionId))}${workspaceSearchResolve(options?.tab)}`
}

export const urlWorkspace = {
  sessions: urlSessions,
  sessionsNew: urlSessionsNew,
  sessionDetail: urlSessionDetail,
  sessionsLegacy: urlSessionsLegacy,
  sessionsLegacyNew: urlSessionsLegacyNew,
  sessionLegacyDetail: urlSessionLegacyDetail,
}
