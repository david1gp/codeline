import type { SessionSidebarTab } from "./sessionSidebarTab.js"

export function sessionSidebarRouteHrefResolve(tab: SessionSidebarTab, url: Pick<URL, "search" | "hash">): string {
  const searchParams = new URLSearchParams(url.search)
  if (tab !== "search") searchParams.delete("search")
  const search = searchParams.toString()
  return `/sessions/${tab}${search === "" ? "" : `?${search}`}${url.hash}`
}
