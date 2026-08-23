import { expect, mock, test } from "bun:test"

mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(initialValue: T) => {
    let value = initialValue
    return { get: () => value, set: (next: T) => (value = next) }
  },
}))

const { sessionPinToggleStateCreate } = await import("../src/ui/sessionPinToggleStateCreate.js")

const tick = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function sessionDetailResponse(input: { etag: string; id: string; pinned: boolean; revision: number }) {
  return Response.json({
    agent: { id: "agent-1" },
    etag: input.etag,
    revision: input.revision,
    schemaVersion: "session.v1",
    server: { id: "server-1" },
    session: {
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      id: input.id,
      metadata: {},
      parentSessionId: null,
      pinned: input.pinned,
      primaryAgentId: "agent-1",
      projectPath: "~",
      revision: input.revision,
      serverId: "server-1",
      title: "Session",
      updatedAt: "2026-08-23T00:00:00.000Z",
    },
  })
}

test("session pin toggle updates immediately and persists through a conditional authenticated request", async () => {
  const requests: Array<{ body: string | undefined; ifMatch: string | null; method: string; url: string }> = []
  let serverPinned = true
  const state = sessionPinToggleStateCreate({
    fetcher: async (input, init) => {
      const method = init?.method ?? "GET"
      const headers = new Headers(init?.headers)
      requests.push({
        body: init?.body?.toString(),
        ifMatch: headers.get("If-Match"),
        method,
        url: String(input),
      })
      if (method === "GET")
        return sessionDetailResponse({ etag: '"pin-etag"', id: "session/1", pinned: serverPinned, revision: 1 })
      serverPinned = false
      return sessionDetailResponse({ etag: '"pin-etag-2"', id: "session/1", pinned: false, revision: 2 })
    },
    sessionId: () => "session/1",
    pinned: () => serverPinned,
  })

  state.toggle()
  expect(state.pinned()).toBe(false)
  expect(state.isSaving()).toBe(true)
  await tick()

  expect(requests).toEqual([
    { body: undefined, ifMatch: null, method: "GET", url: "/api/sessions/session%2F1" },
    {
      body: JSON.stringify({ pinned: false }),
      ifMatch: '"pin-etag"',
      method: "PATCH",
      url: "/api/sessions/session%2F1/pin",
    },
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
    fetcher: async (_input, init) =>
      sessionDetailResponse({
        etag: (init?.method ?? "GET") === "GET" ? '"pin-etag"' : '"pin-etag-2"',
        id: "session-1",
        pinned: true,
        revision: (init?.method ?? "GET") === "GET" ? 1 : 2,
      }),
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
    fetcher: async (_input, init) => {
      if ((init?.method ?? "GET") === "GET")
        return sessionDetailResponse({ etag: '"pin-etag"', id: "session-1", pinned: true, revision: 1 })
      return Response.json({ error: { code: "conflict", message: "The session is archived." } }, { status: 409 })
    },
    sessionId: () => "session-1",
    pinned: () => true,
  })

  state.toggle()
  expect(state.pinned()).toBe(false)
  await tick()

  expect(state.pinned()).toBe(true)
  expect(state.errorMessage()).toBe("The session is archived.")
})
