import { expect, mock, test } from "bun:test"

mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(initialValue: T) => {
    let value = initialValue
    return { get: () => value, set: (next: T) => (value = next) }
  },
}))

const { sessionPinToggleStateCreate } = await import("../src/ui/sessionPinToggleStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("session pin toggle updates immediately and persists through the authenticated API", async () => {
  const requests: Array<{ body: string | undefined; method: string | undefined; url: string }> = []
  let serverPinned = true
  const state = sessionPinToggleStateCreate({
    fetcher: async (input, init) => {
      requests.push({ body: init?.body?.toString(), method: init?.method, url: String(input) })
      serverPinned = false
      return Response.json({ session: { id: "session/1", pinned: false } })
    },
    sessionId: () => "session/1",
    pinned: () => serverPinned,
  })

  state.toggle()
  expect(state.pinned()).toBe(false)
  expect(state.isSaving()).toBe(true)
  await tick()

  expect(requests).toEqual([
    { body: JSON.stringify({ pinned: false }), method: "PATCH", url: "/api/sessions/session%2F1/pin" },
  ])
  expect(state.pinned()).toBe(false)
  expect(state.isSaving()).toBe(false)

  serverPinned = true
  expect(state.pinned()).toBe(true)
})

test("selected-session pin state follows the source query after a successful toggle", async () => {
  const selectedSessionSource = await Bun.file(
    new URL("../src/ui/selectedSessionStateCreate.ts", import.meta.url),
  ).text()
  expect(selectedSessionSource).toContain("pinned: () => session()?.pinned ?? current.pinned")

  let sourcePinned = false
  const state = sessionPinToggleStateCreate({
    fetcher: async () => Response.json({ session: { id: "session-1", pinned: true } }),
    sessionId: () => "session-1",
    pinned: () => sourcePinned,
  })

  state.toggle()
  await tick()
  expect(state.pinned()).toBe(false)

  sourcePinned = true
  expect(state.pinned()).toBe(true)
})

test("session pin toggle restores API state and exposes a retryable error", async () => {
  const state = sessionPinToggleStateCreate({
    fetcher: async () =>
      Response.json({ error: { code: "conflict", message: "The session is archived." } }, { status: 409 }),
    sessionId: () => "session-1",
    pinned: () => true,
  })

  state.toggle()
  expect(state.pinned()).toBe(false)
  await tick()

  expect(state.pinned()).toBe(true)
  expect(state.errorMessage()).toBe("The session is archived.")
})
