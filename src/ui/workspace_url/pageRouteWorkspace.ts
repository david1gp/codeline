import type { PageNameWorkspace } from "./pageNameWorkspace.js"

export type PageRouteWorkspace = keyof typeof pageRouteWorkspace

export const pageRouteWorkspace = {
  sessions: "/sessions",
  sessionsNew: "/sessions/new",
  sessionDetail: "/sessions/:sessionId",
  sessionsLegacy: "/sessions-legacy",
  sessionsLegacyNew: "/sessions-legacy/new",
  sessionLegacyDetail: "/sessions-legacy/:sessionId",
} as const satisfies Record<PageNameWorkspace, string>
