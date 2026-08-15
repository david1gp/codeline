import { expect, mock, test } from "bun:test"

mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(initialValue: T) => {
    let value = initialValue
    return { get: () => value, set: (next: T) => (value = next) }
  },
}))

const { sessionWatchToggleStateCreate } = await import("../src/ui/sessionWatchToggleStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("session watch toggle updates immediately and persists through the authenticated API", async () => {
  const requests: Array<{ body: string | undefined; method: string | undefined; url: string }> = []
  let serverWatched = true
  const state = sessionWatchToggleStateCreate({
    fetcher: async (input, init) => {
      requests.push({ body: init?.body?.toString(), method: init?.method, url: String(input) })
      serverWatched = false
      return Response.json({ session: { id: "session/1", watched: false } })
    },
    sessionId: () => "session/1",
    watched: () => serverWatched,
  })

  state.toggle()
  expect(state.watched()).toBe(false)
  expect(state.isSaving()).toBe(true)
  await tick()

  expect(requests).toEqual([
    { body: JSON.stringify({ watched: false }), method: "PATCH", url: "/api/sessions/session%2F1/watch" },
  ])
  expect(state.watched()).toBe(false)
  expect(state.isSaving()).toBe(false)

  serverWatched = true
  expect(state.watched()).toBe(true)
})

test("selected-session watch state follows the source query after a successful toggle", async () => {
  const selectedSessionSource = await Bun.file(
    new URL("../src/ui/selectedSessionStateCreate.ts", import.meta.url),
  ).text()
  expect(selectedSessionSource).toContain("watched: () => session()?.watched ?? current.watched")

  let sourceWatched = false
  const state = sessionWatchToggleStateCreate({
    fetcher: async () => Response.json({ session: { id: "session-1", watched: true } }),
    sessionId: () => "session-1",
    watched: () => sourceWatched,
  })

  state.toggle()
  await tick()
  expect(state.watched()).toBe(false)

  sourceWatched = true
  expect(state.watched()).toBe(true)
})

test("session watch toggle restores API state and exposes a retryable error", async () => {
  const state = sessionWatchToggleStateCreate({
    fetcher: async () =>
      Response.json({ error: { code: "conflict", message: "The session is archived." } }, { status: 409 }),
    sessionId: () => "session-1",
    watched: () => true,
  })

  state.toggle()
  expect(state.watched()).toBe(false)
  await tick()

  expect(state.watched()).toBe(true)
  expect(state.errorMessage()).toBe("The session is archived.")
})
