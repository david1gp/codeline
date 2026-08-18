import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { sessionNavigationStateCreate } from "../src/ui/sessionNavigationStateCreate.js"
import { sessionSidebarRouteStateCreate } from "../src/ui/sessionSidebarRouteStateCreate.js"
import { signalObjectCreate } from "../src/ui/signalObjectCreate.js"

function navigationCreate(initialUrl: string) {
  let href = new URL(initialUrl).href
  const listeners = new Set<() => void>()
  const pushedUrls: string[] = []

  return {
    location: {
      get href() {
        return href
      },
    },
    history: {
      pushState: (_state: unknown, _title: string, url?: string | URL | null) => {
        if (url === undefined || url === null) return
        href = new URL(url, href).href
        pushedUrls.push(href)
      },
    },
    addEventListener: (_type: "popstate", listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: "popstate", listener: () => void) => void listeners.delete(listener),
    emitPopstate: () => {
      listeners.forEach((listener) => {
        listener()
      })
    },
    pushedUrls,
    get href() {
      return href
    },
    listenerCount: () => listeners.size,
  }
}

test("session navigation parses, pushes, clears, and reloads from the session URL", () => {
  const navigation = navigationCreate("https://codeline.test/sessions/recent?mode=active&session=first#chat")
  const dispose = createRoot((rootDispose) => {
    const state = sessionNavigationStateCreate(navigation)

    expect(state.selectedSessionId()).toBe("first")
    state.selectSession("second")
    expect(state.selectedSessionId()).toBe("second")
    expect(navigation.href).toBe("https://codeline.test/sessions/second?tab=recent&mode=active#chat")
    expect(navigation.pushedUrls).toHaveLength(1)

    return rootDispose
  })

  dispose()
  expect(navigation.listenerCount()).toBe(0)

  const reloadDispose = createRoot((rootDispose) => {
    const reloaded = sessionNavigationStateCreate(navigation)
    expect(reloaded.selectedSessionId()).toBe("second")

    reloaded.clearSession()
    expect(reloaded.selectedSessionId()).toBeNull()
    expect(navigation.href).toBe("https://codeline.test/sessions?tab=recent&mode=active#chat")

    return rootDispose
  })
  reloadDispose()
  expect(navigation.listenerCount()).toBe(0)
})

test("session navigation follows browser back and forward popstate changes", () => {
  const navigation = navigationCreate("https://codeline.test/sessions/pinned?session=first")
  const dispose = createRoot((rootDispose) => {
    const state = sessionNavigationStateCreate(navigation)
    expect(navigation.listenerCount()).toBe(1)

    navigation.history.pushState(null, "", "https://codeline.test/sessions/projects?session=second")
    navigation.emitPopstate()
    expect(state.selectedSessionId()).toBe("second")

    navigation.history.pushState(null, "", "https://codeline.test/sessions/search")
    navigation.emitPopstate()
    expect(state.selectedSessionId()).toBeNull()

    return rootDispose
  })

  dispose()
  expect(navigation.listenerCount()).toBe(0)
})

test("session navigation parses canonical selected and reserved new routes", () => {
  const navigation = navigationCreate("https://codeline.test/sessions/selected?tab=pinned")
  const dispose = createRoot((rootDispose) => {
    const state = sessionNavigationStateCreate(navigation)
    expect(state.selectedSessionId()).toBe("selected")

    navigation.history.pushState(null, "", "https://codeline.test/sessions/new?tab=pinned")
    navigation.emitPopstate()
    expect(state.selectedSessionId()).toBeNull()

    return rootDispose
  })

  dispose()
})

test("session navigation enters the canonical new route before selecting the created session", () => {
  const navigation = navigationCreate("https://codeline.test/sessions/selected?tab=pinned#chat")
  const dispose = createRoot((rootDispose) => {
    const state = sessionNavigationStateCreate(navigation)

    state.startNewSession()
    expect(state.selectedSessionId()).toBeNull()
    expect(state.isNewSessionRoute()).toBe(true)
    expect(navigation.href).toBe("https://codeline.test/sessions/new?tab=pinned#chat")

    state.selectSession("created")
    expect(state.selectedSessionId()).toBe("created")
    expect(state.isNewSessionRoute()).toBe(false)
    expect(navigation.href).toBe("https://codeline.test/sessions/created?tab=pinned#chat")

    return rootDispose
  })

  dispose()
})

test("session sidebar reads the router URL after session selection navigation", async () => {
  const href = signalObjectCreate("https://codeline.test/sessions?tab=recent")
  const root = createRoot((dispose) => {
    const navigation = sessionNavigationStateCreate({
      location: {
        get href() {
          return href.get()
        },
      },
      history: { pushState: () => undefined },
      navigate: (nextHref) => href.set(new URL(nextHref, href.get()).href),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })
    const sidebar = sessionSidebarRouteStateCreate({
      href: href.get,
      navigate: (nextHref) => href.set(new URL(nextHref, href.get()).href),
      storage: null,
    })

    return { dispose, navigation, sidebar }
  })

  root.navigation.selectSession("selected")
  await new Promise((resolve) => setTimeout(resolve, 0))
  root.sidebar.selectTab("pinned")

  expect(href.get()).toBe("https://codeline.test/sessions/selected?tab=pinned")
  root.dispose()
})

test("session navigation reserves a new session while preserving the active tab", () => {
  const navigation = navigationCreate("https://codeline.test/sessions?tab=projects")
  const dispose = createRoot((rootDispose) => {
    const state = sessionNavigationStateCreate(navigation)

    state.startNewSession()
    state.startNewSession()

    expect(navigation.href).toBe("https://codeline.test/sessions/new?tab=projects")
    expect(navigation.pushedUrls).toEqual(["https://codeline.test/sessions/new?tab=projects"])

    return rootDispose
  })

  dispose()
})
