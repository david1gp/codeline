import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { sessionNavigationStateCreate } from "../src/ui/sessionNavigationStateCreate.js"

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
  const navigation = navigationCreate("https://codeline.test/workspace?mode=active&session=first#chat")
  const dispose = createRoot((rootDispose) => {
    const state = sessionNavigationStateCreate(navigation)

    expect(state.selectedSessionId()).toBe("first")
    state.selectSession("second")
    expect(state.selectedSessionId()).toBe("second")
    expect(navigation.href).toBe("https://codeline.test/workspace?mode=active&session=second#chat")
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
    expect(navigation.href).toBe("https://codeline.test/workspace?mode=active#chat")

    return rootDispose
  })
  reloadDispose()
  expect(navigation.listenerCount()).toBe(0)
})

test("session navigation follows browser back and forward popstate changes", () => {
  const navigation = navigationCreate("https://codeline.test/workspace?session=first")
  const dispose = createRoot((rootDispose) => {
    const state = sessionNavigationStateCreate(navigation)
    expect(navigation.listenerCount()).toBe(1)

    navigation.history.pushState(null, "", "https://codeline.test/workspace?session=second")
    navigation.emitPopstate()
    expect(state.selectedSessionId()).toBe("second")

    navigation.history.pushState(null, "", "https://codeline.test/workspace")
    navigation.emitPopstate()
    expect(state.selectedSessionId()).toBeNull()

    return rootDispose
  })

  dispose()
  expect(navigation.listenerCount()).toBe(0)
})
