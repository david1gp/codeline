import * as v from "valibot"
import { sessionSidebarRouteHrefResolve } from "./sessionSidebarRouteHrefResolve.js"
import { sessionSidebarTabSchema } from "./sessionSidebarTab.js"

const sessionSidebarTabStorageKey = "codeline.sessionSidebarTab"

export function sessionSidebarDestinationResolve(pathname: string, storage?: Pick<Storage, "getItem"> | null): string {
  const url = new URL(pathname, "https://codeline.local")
  const normalizedPathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname
  const routeTab = normalizedPathname.startsWith("/sessions/")
    ? normalizedPathname.slice("/sessions/".length)
    : undefined
  const parsedRouteTab = v.safeParse(sessionSidebarTabSchema, routeTab)
  if (parsedRouteTab.success) return sessionSidebarRouteHrefResolve(parsedRouteTab.output, url)

  try {
    const resolvedStorage = storage === undefined ? globalThis.localStorage : storage
    const parsedStoredTab = v.safeParse(sessionSidebarTabSchema, resolvedStorage?.getItem(sessionSidebarTabStorageKey))
    if (parsedStoredTab.success) return sessionSidebarRouteHrefResolve(parsedStoredTab.output, url)
  } catch (_error: unknown) {
    // Navigation remains available when persistence is blocked.
  }

  return sessionSidebarRouteHrefResolve("recent", url)
}
