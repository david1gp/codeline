import * as v from "valibot"
import { type SessionSidebarTab, sessionSidebarTabSchema } from "./sessionSidebarTab.js"

const sessionIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export function sessionRouteResolve(url: Pick<URL, "pathname" | "search">) {
  const normalizedPathname =
    url.pathname.endsWith("/") && url.pathname !== "/" ? url.pathname.slice(0, -1) : url.pathname
  const searchParams = new URLSearchParams(url.search)
  const parsedQueryTab = v.safeParse(sessionSidebarTabSchema, searchParams.get("tab") ?? "")
  const queryTab: SessionSidebarTab | null = parsedQueryTab.success ? parsedQueryTab.output : null
  const parsedLegacySessionId = v.safeParse(sessionIdSchema, searchParams.get("session") ?? "")
  const legacySessionId = parsedLegacySessionId.success ? parsedLegacySessionId.output : null

  if (normalizedPathname === "/sessions") {
    return { kind: "base" as const, sessionId: legacySessionId, tab: queryTab }
  }
  if (!normalizedPathname.startsWith("/sessions/")) {
    return { kind: "invalid" as const, sessionId: null, tab: null }
  }

  const routeSegment = normalizedPathname.slice("/sessions/".length)
  if (routeSegment === "new") return { kind: "new" as const, sessionId: null, tab: queryTab }
  const parsedSessionId = v.safeParse(sessionIdSchema, routeSegment)
  if (parsedQueryTab.success && parsedSessionId.success && !routeSegment.includes("/")) {
    return { kind: "selected" as const, sessionId: parsedSessionId.output, tab: queryTab }
  }
  const parsedSidebarTab = v.safeParse(sessionSidebarTabSchema, routeSegment)
  if (parsedSidebarTab.success) {
    return { kind: "legacy-tab" as const, sessionId: legacySessionId, tab: queryTab ?? parsedSidebarTab.output }
  }

  if (!parsedSessionId.success || routeSegment.includes("/")) {
    return { kind: "invalid" as const, sessionId: null, tab: null }
  }

  return { kind: "selected" as const, sessionId: parsedSessionId.output, tab: queryTab }
}
