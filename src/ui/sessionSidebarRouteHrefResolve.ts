import { sessionRouteResolve } from "./sessionRouteResolve.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"

export function sessionSidebarRouteHrefResolve(
  tab: SessionSidebarTab,
  url: Pick<URL, "search" | "hash"> & Partial<Pick<URL, "pathname">>,
): string {
  const route = sessionRouteResolve({ pathname: url.pathname ?? "/sessions", search: url.search })
  const sourceSearchParams = new URLSearchParams(url.search)
  const searchParams = new URLSearchParams({ tab })
  sourceSearchParams.forEach((value, key) => {
    if (key === "tab" || (key === "search" && tab !== "search")) return
    searchParams.append(key, value)
  })
  const search = searchParams.toString()
  const pathname =
    route.kind === "new"
      ? "/sessions/new"
      : route.sessionId
        ? `/sessions/${encodeURIComponent(route.sessionId)}`
        : "/sessions"
  return `${pathname}${search === "" ? "" : `?${search}`}${url.hash}`
}
