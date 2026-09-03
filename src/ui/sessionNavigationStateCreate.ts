import { createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { sessionRouteResolve } from "./sessionRouteResolve.js"
import { sessionSidebarDestinationResolve } from "./sessionSidebarDestinationResolve.js"
import { sessionSidebarRouteHrefResolve } from "./sessionSidebarRouteHrefResolve.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"
import { pageRouteWorkspace } from "./workspace_url/pageRouteWorkspace.js"
import { urlWorkspace } from "./workspace_url/urlWorkspace.js"

const sessionIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

type SessionNavigation = {
  location: Pick<Location, "href">
  history: Pick<History, "pushState">
  navigate?: (href: string) => void
  addEventListener: (type: "popstate", listener: () => void) => void
  removeEventListener: (type: "popstate", listener: () => void) => void
}

function sessionNavigationResolve(navigation: SessionNavigation): string | null {
  return sessionRouteResolve(new URL(navigation.location.href)).sessionId
}

function sessionNavigationIsNewRouteResolve(navigation: SessionNavigation): boolean {
  return sessionRouteResolve(new URL(navigation.location.href)).kind === "new"
}

function sessionNavigationTabResolve(url: URL): SessionSidebarTab {
  const route = sessionRouteResolve(url)
  if (route.tab !== null) return route.tab

  const destination = new URL(sessionSidebarDestinationResolve(url.href), url)
  return sessionRouteResolve(destination).tab ?? "recent"
}

export function sessionNavigationStateCreate(navigation: SessionNavigation = window) {
  const [selectedSessionId, setSelectedSessionId] = createSignal(sessionNavigationResolve(navigation))
  const [isNewSessionRoute, setIsNewSessionRoute] = createSignal(sessionNavigationIsNewRouteResolve(navigation))
  const updateUrl = (pathname: string, sessionId: string | null, push = true) => {
    const url = new URL(navigation.location.href)
    const href = sessionSidebarRouteHrefResolve(sessionNavigationTabResolve(url), {
      hash: url.hash,
      pathname,
      search: url.search,
    })
    const currentPath = `${url.pathname}${url.search}${url.hash}`
    if (push || currentPath !== href) {
      if (navigation.navigate) navigation.navigate(href)
      else navigation.history.pushState(null, "", href)
    }
    setSelectedSessionId(sessionId)
    setIsNewSessionRoute(sessionRouteResolve(new URL(href, url)).kind === "new")
  }
  const handlePopstate = () => {
    setSelectedSessionId(sessionNavigationResolve(navigation))
    setIsNewSessionRoute(sessionNavigationIsNewRouteResolve(navigation))
  }

  navigation.addEventListener("popstate", handlePopstate)
  onCleanup(() => navigation.removeEventListener("popstate", handlePopstate))

  return {
    isNewSessionRoute,
    selectedSessionId,
    selectSession: (sessionId: string) => {
      const result = v.safeParse(sessionIdSchema, sessionId)
      if (result.success) updateUrl(urlWorkspace.sessionDetail(result.output), result.output)
    },
    clearSession: () => updateUrl(pageRouteWorkspace.sessions, null),
    startNewSession: () => updateUrl(pageRouteWorkspace.sessionsNew, null, false),
  }
}

export type SessionNavigationState = ReturnType<typeof sessionNavigationStateCreate>
