import { createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { sessionRouteResolve } from "./sessionRouteResolve.js"

const sessionIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

type SessionNavigation = {
  location: Pick<Location, "href">
  history: Pick<History, "pushState">
  addEventListener: (type: "popstate", listener: () => void) => void
  removeEventListener: (type: "popstate", listener: () => void) => void
}

function sessionNavigationResolve(navigation: SessionNavigation): string | null {
  return sessionRouteResolve(new URL(navigation.location.href)).sessionId
}

export function sessionNavigationStateCreate(navigation: SessionNavigation = window) {
  const [selectedSessionId, setSelectedSessionId] = createSignal(sessionNavigationResolve(navigation))
  const updateUrl = (sessionId: string | null) => {
    const url = new URL(navigation.location.href)
    if (sessionId === null) {
      url.searchParams.delete("session")
    } else {
      url.searchParams.set("session", sessionId)
    }
    navigation.history.pushState(null, "", url)
    setSelectedSessionId(sessionId)
  }
  const handlePopstate = () => setSelectedSessionId(sessionNavigationResolve(navigation))

  navigation.addEventListener("popstate", handlePopstate)
  onCleanup(() => navigation.removeEventListener("popstate", handlePopstate))

  return {
    selectedSessionId,
    selectSession: (sessionId: string) => {
      const result = v.safeParse(sessionIdSchema, sessionId)
      if (result.success) updateUrl(result.output)
    },
    clearSession: () => updateUrl(null),
  }
}

export type SessionNavigationState = ReturnType<typeof sessionNavigationStateCreate>
