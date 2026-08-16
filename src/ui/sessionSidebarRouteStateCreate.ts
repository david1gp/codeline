import type { Accessor } from "solid-js"
import { createEffect } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { sessionRouteResolve } from "./sessionRouteResolve.js"
import { sessionSidebarRouteHrefResolve } from "./sessionSidebarRouteHrefResolve.js"
import { type SessionSidebarTab, sessionSidebarTabSchema } from "./sessionSidebarTab.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

const sessionSidebarTabFallback: SessionSidebarTab = "recent"
const sessionSidebarTabStorageKey = "codeline.sessionSidebarTab"

type SessionSidebarRouteNavigate = (href: string, options?: { replace?: boolean; scroll?: boolean }) => void

type SessionSidebarRouteStateOptions = {
  href: Accessor<string>
  navigate: SessionSidebarRouteNavigate
  storage?: Pick<Storage, "getItem" | "setItem"> | null
}

function storageResolve(
  storage: SessionSidebarRouteStateOptions["storage"],
): Pick<Storage, "getItem" | "setItem"> | undefined {
  if (storage === null) return undefined
  if (storage !== undefined) return storage

  try {
    return globalThis.localStorage
  } catch (_error: unknown) {
    return undefined
  }
}

function storedTabRead(storage: Pick<Storage, "getItem" | "setItem"> | undefined): SessionSidebarTab {
  try {
    const result = v.safeParse(sessionSidebarTabSchema, storage?.getItem(sessionSidebarTabStorageKey))
    return result.success ? result.output : sessionSidebarTabFallback
  } catch (_error: unknown) {
    return sessionSidebarTabFallback
  }
}

function storedTabWrite(storage: Pick<Storage, "getItem" | "setItem"> | undefined, tab: SessionSidebarTab): void {
  try {
    storage?.setItem(sessionSidebarTabStorageKey, tab)
  } catch (_error: unknown) {
    // Route state remains available when persistence is blocked.
  }
}

function routeResolve(href: string, storage: Pick<Storage, "getItem" | "setItem"> | undefined) {
  const url = new URL(href, "https://codeline.local")
  const route = sessionRouteResolve(url)
  const tab = route.tab ?? storedTabRead(storage)

  return {
    href: sessionSidebarRouteHrefResolve(tab, url),
    pathname: url.pathname,
    tab,
  }
}

export function sessionSidebarRouteStateCreate(options: SessionSidebarRouteStateOptions) {
  const href = options.href
  const navigate = options.navigate
  const storage = storageResolve(options.storage)
  const initial = routeResolve(href(), storage)
  const activeTab = signalObjectCreate<SessionSidebarTab>(initial.tab)

  createEffect(() => {
    const current = routeResolve(href(), storage)
    activeTab.set(current.tab)
    storedTabWrite(storage, current.tab)
    const currentUrl = new URL(href(), "https://codeline.local")
    const currentPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
    if (currentPath !== current.href) navigate(current.href, { replace: true, scroll: false })
  })

  return {
    activeTab: activeTab.get,
    selectTab: (value: SessionSidebarTab) => {
      const parsed = v.safeParse(sessionSidebarTabSchema, value)
      if (!parsed.success) return
      const url = new URL(href(), "https://codeline.local")
      activeTab.set(parsed.output)
      storedTabWrite(storage, parsed.output)
      navigate(sessionSidebarRouteHrefResolve(parsed.output, url), { scroll: false })
    },
  }
}

export type SessionSidebarRouteState = ReturnType<typeof sessionSidebarRouteStateCreate>
