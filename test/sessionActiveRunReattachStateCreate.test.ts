import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
const { sessionActiveRunReattachStateCreate } = await import("../src/ui/sessionActiveRunReattachStateCreate.js")

type Attached = {
  lastCursor: string | null
  lastSequence: number
  partialText: string
  runId: string
  sessionId: string
  status: string
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test("reload discovery lists the session's active runs then attaches each run-specific snapshot", async () => {
  const requested: string[] = []
  const attached: Attached[] = []

  const { dispose, state } = createRoot((disposeRoot) => ({
    dispose: disposeRoot,
    state: sessionActiveRunReattachStateCreate({
      activeRunAttach: (input) => {
        attached.push(input)
      },
      fetch: async (input) => {
        const path = String(input)
        requested.push(path)
        if (path.endsWith("/active-runs")) return Response.json({ runs: [{ runId: "run-1", status: "running" }] })
        return Response.json({
          lastCursor: "v1.cursor-12",
          lastSequence: 12,
          partialText: "hello world",
          status: "running",
        })
      },
      sessionId: () => "session-1",
    }),
  }))

  await settle()

  // Discovery precedes the run-specific snapshot, and neither replays from an arbitrary cursor.
  expect(requested).toEqual(["/api/sessions/session-1/active-runs", "/api/sessions/session-1/runs/run-1/snapshot"])
  expect(attached).toEqual([
    {
      lastCursor: "v1.cursor-12",
      lastSequence: 12,
      partialText: "hello world",
      runId: "run-1",
      sessionId: "session-1",
      status: "running",
    },
  ])
  expect(state.status()).toBe("attached")
  expect(state.runIds()).toEqual(["run-1"])
  dispose()
})

test("a session without active runs performs no snapshot read", async () => {
  const requested: string[] = []
  const { dispose, state } = createRoot((disposeRoot) => ({
    dispose: disposeRoot,
    state: sessionActiveRunReattachStateCreate({
      activeRunAttach: () => undefined,
      fetch: async (input) => {
        requested.push(String(input))
        return Response.json({ runs: [] })
      },
      sessionId: () => "session-1",
    }),
  }))

  await settle()

  expect(requested).toEqual(["/api/sessions/session-1/active-runs"])
  expect(state.status()).toBe("none")
  dispose()
})

test("reattachment stays idle without a selected session or while disabled", async () => {
  const requested: string[] = []
  const fetchSpy = async (input: RequestInfo | URL) => {
    requested.push(String(input))
    return Response.json({ runs: [] })
  }

  const noSelection = createRoot((disposeRoot) => ({
    dispose: disposeRoot,
    state: sessionActiveRunReattachStateCreate({
      activeRunAttach: () => undefined,
      fetch: fetchSpy,
      sessionId: () => null,
    }),
  }))
  const disabled = createRoot((disposeRoot) => ({
    dispose: disposeRoot,
    state: sessionActiveRunReattachStateCreate({
      activeRunAttach: () => undefined,
      enabled: () => false,
      fetch: fetchSpy,
      sessionId: () => "session-1",
    }),
  }))

  await settle()

  expect(requested).toEqual([])
  expect(noSelection.state.status()).toBe("idle")
  expect(disabled.state.status()).toBe("idle")
  noSelection.dispose()
  disabled.dispose()
})

test("a failed discovery or snapshot read is reported instead of silently dropping the run", async () => {
  const { dispose, state } = createRoot((disposeRoot) => ({
    dispose: disposeRoot,
    state: sessionActiveRunReattachStateCreate({
      activeRunAttach: () => undefined,
      fetch: async (input) => {
        if (String(input).endsWith("/active-runs"))
          return Response.json({ runs: [{ runId: "run-1", status: "running" }] })
        return new Response("", { status: 500, statusText: "Internal Server Error" })
      },
      sessionId: () => "session-1",
    }),
  }))

  await settle()

  expect(state.status()).toBe("error")
  dispose()
})
