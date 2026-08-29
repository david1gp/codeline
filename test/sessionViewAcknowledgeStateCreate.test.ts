import { expect, test } from "bun:test"
import { sessionViewAcknowledgeStateCreate } from "../src/ui/sessionViewAcknowledgeStateCreate.js"

const response = () =>
  Response.json({
    acknowledgedFinishedAt: "2026-08-29T12:00:00.000Z",
    sessionId: "session-1",
  })

const flush = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

test("session view acknowledgement coalesces repeated loads", async () => {
  const requests: Array<{ method: string | undefined; url: string }> = []
  const state = sessionViewAcknowledgeStateCreate({
    fetch: async (input, init) => {
      requests.push({ method: init?.method, url: String(input) })
      return response()
    },
  })

  state.acknowledge("session-1")
  state.acknowledge("session-1")
  await flush()

  expect(requests).toEqual([{ method: "POST", url: "/api/sessions/session-1/view" }])
})

test("completion acknowledgement waits for an in-flight load acknowledgement", async () => {
  let release: (() => void) | undefined
  const requests: string[] = []
  const first = new Promise<Response>((resolve) => {
    release = () => resolve(response())
  })
  const state = sessionViewAcknowledgeStateCreate({
    fetch: async (input) => {
      requests.push(String(input))
      if (requests.length === 1) return first
      return response()
    },
  })

  state.acknowledge("session-1")
  state.acknowledge("session-1", true)
  release?.()
  await flush()
  await flush()

  expect(requests).toEqual(["/api/sessions/session-1/view", "/api/sessions/session-1/view"])
})
