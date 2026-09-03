import { sessionRouteResolve } from "./sessionRouteResolve.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"
import { pageRouteWorkspace } from "./workspace_url/pageRouteWorkspace.js"
import { urlWorkspace } from "./workspace_url/urlWorkspace.js"

export function sessionSidebarRouteHrefResolve(
  tab: SessionSidebarTab,
  url: Pick<URL, "search" | "hash"> & Partial<Pick<URL, "pathname">>,
): string {
  const route = sessionRouteResolve({ pathname: url.pathname ?? pageRouteWorkspace.sessions, search: url.search })
  const sourceSearchParams = new URLSearchParams(url.search)
  const searchParams = new URLSearchParams({ tab })
  sourceSearchParams.forEach((value, key) => {
    if (key === "tab" || (key === "search" && tab !== "search")) return
    searchParams.append(key, value)
  })
  const search = searchParams.toString()
  const pathname =
    route.kind === "new"
      ? pageRouteWorkspace.sessionsNew
      : route.sessionId
        ? urlWorkspace.sessionDetail(route.sessionId)
        : pageRouteWorkspace.sessions
  return `${pathname}${search === "" ? "" : `?${search}`}${url.hash}`
}
