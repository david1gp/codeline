import * as v from "valibot"
import { type SessionSidebarTab, sessionSidebarTabSchema } from "./sessionSidebarTab.js"
import { pageRouteWorkspace } from "./workspace_url/pageRouteWorkspace.js"

const sessionIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
const sessionDetailPrefix = pageRouteWorkspace.sessionDetail.replace(":sessionId", "")

export function sessionRouteResolve(url: Pick<URL, "pathname" | "search">) {
  const normalizedPathname =
    url.pathname.endsWith("/") && url.pathname !== "/" ? url.pathname.slice(0, -1) : url.pathname
  const searchParams = new URLSearchParams(url.search)
  const parsedQueryTab = v.safeParse(sessionSidebarTabSchema, searchParams.get("tab") ?? "")
  const queryTab: SessionSidebarTab | null = parsedQueryTab.success ? parsedQueryTab.output : null

  if (normalizedPathname === pageRouteWorkspace.sessions) {
    return { kind: "base" as const, sessionId: null, tab: queryTab }
  }
  if (!normalizedPathname.startsWith(sessionDetailPrefix)) {
    return { kind: "invalid" as const, sessionId: null, tab: null }
  }

  const routeSegment = normalizedPathname.slice(sessionDetailPrefix.length)
  if (normalizedPathname === pageRouteWorkspace.sessionsNew) {
    return { kind: "new" as const, sessionId: null, tab: queryTab }
  }
  const parsedSessionId = v.safeParse(sessionIdSchema, routeSegment)

  if (!parsedSessionId.success || routeSegment.includes("/")) {
    return { kind: "invalid" as const, sessionId: null, tab: null }
  }

  return { kind: "selected" as const, sessionId: parsedSessionId.output, tab: queryTab }
}
