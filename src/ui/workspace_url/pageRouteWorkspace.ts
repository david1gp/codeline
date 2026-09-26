import type { PageNameWorkspace } from "./pageNameWorkspace.js"

export type PageRouteWorkspace = keyof typeof pageRouteWorkspace

export const pageRouteWorkspace = {
  sessions: "/sessions",
  sessionsNew: "/sessions/new",
  sessionDetail: "/sessions/:sessionId",
} as const satisfies Record<PageNameWorkspace, string>
