import * as v from "valibot"
import { sessionRouteResolve } from "./sessionRouteResolve.js"
import { sessionSidebarRouteHrefResolve } from "./sessionSidebarRouteHrefResolve.js"
import { sessionSidebarTabSchema } from "./sessionSidebarTab.js"

const sessionSidebarTabStorageKey = "codeline.sessionSidebarTab"

export function sessionSidebarDestinationResolve(pathname: string, storage?: Pick<Storage, "getItem"> | null): string {
  const url = new URL(pathname, "https://codeline.local")
  const route = sessionRouteResolve(url)
  if (route.tab !== null) return sessionSidebarRouteHrefResolve(route.tab, url)

  try {
    const resolvedStorage = storage === undefined ? globalThis.localStorage : storage
    const parsedStoredTab = v.safeParse(sessionSidebarTabSchema, resolvedStorage?.getItem(sessionSidebarTabStorageKey))
    if (parsedStoredTab.success) return sessionSidebarRouteHrefResolve(parsedStoredTab.output, url)
  } catch (_error: unknown) {
    // Navigation remains available when persistence is blocked.
  }

  return sessionSidebarRouteHrefResolve("recent", url)
}
