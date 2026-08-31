import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
const { sessionBoundedHistoryStateCreate } = await import("../src/session/client/sessionBoundedHistoryStateCreate.js")

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

const sessionCreate = (id = "session-1") => ({
  id,
  pinned: false,
  projectPath: "~",
  revision: 1,
  title: id,
})

const messageStepCreate = (id: string, sequence: number) => ({
  id,
  kind: "message",
  role: sequence % 2 === 0 ? "assistant" : "user",
  sequence,
  summary: id,
})

const snapshotCreate = (
  semanticSteps: ReadonlyArray<ReturnType<typeof messageStepCreate>>,
  input: { cursor?: string | null; sessionId?: string; throughSeq?: number } = {},
) => ({
  hasMore: input.cursor !== null,
  latestAnswer: null,
  olderCursor: input.cursor === undefined ? "cursor-older-1" : input.cursor,
  semanticSteps,
  session: sessionCreate(input.sessionId),
  state: { input: null, run: null },
  throughSeq: input.throughSeq ?? 10,
})

test("bounded client reads use typed snapshot and opaque-cursor endpoints", async () => {
  const requests: string[] = []
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    requests.push(url)
    if (url.includes("bounded-history"))
      return Response.json({
        hasMore: false,
        nextCursor: null,
        semanticSteps: [messageStepCreate("message-1", 1)],
        throughSeq: 10,
      })
    return Response.json(snapshotCreate([messageStepCreate("message-2", 2)], { sessionId: "session/1" }))
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({ fetch, sessionId: () => "session/1" }),
  }))

  await settle()
  await root.state.loadOlder()

  expect(requests).toEqual([
    "/api/sessions/session%2F1/bounded-snapshot",
    "/api/sessions/session%2F1/bounded-history?cursor=cursor-older-1&limit=25",
  ])
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["message-1", "message-2"])
  root.dispose()
})

test("older pages prepend stably, deduplicate overlaps, and retain a failed cursor for retry", async () => {
  let secondPageAttempts = 0
  const recent = messageStepCreate("message-3", 3)
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("bounded-snapshot"))
      return Response.json(snapshotCreate([recent, messageStepCreate("message-4", 4)]))
    if (url.includes("cursor=cursor-older-1"))
      return Response.json({
        hasMore: true,
        nextCursor: "cursor-older-2",
        semanticSteps: [messageStepCreate("message-2", 2), messageStepCreate("message-3", 3)],
        throughSeq: 10,
      })
    secondPageAttempts += 1
    if (secondPageAttempts === 1) return new Response("", { status: 503, statusText: "Unavailable" })
    return Response.json({
      hasMore: false,
      nextCursor: null,
      semanticSteps: [messageStepCreate("message-1", 1), messageStepCreate("message-2", 2)],
      throughSeq: 10,
    })
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({ fetch, sessionId: () => "session-1" }),
  }))

  await settle()
  const recentIdentity = root.state.semanticSteps()[0]
  await root.state.loadOlder()
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["message-2", "message-3", "message-4"])
  expect(root.state.semanticSteps()[1]).toBe(recentIdentity)
  expect(root.state.hasMore()).toBe(true)

  await root.state.loadOlder()
  expect(root.state.isOlderError()).toBe(true)
  expect(root.state.hasMore()).toBe(true)
  root.state.retryOlder()
  await settle()

  expect(root.state.isOlderError()).toBe(false)
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual([
    "message-1",
    "message-2",
    "message-3",
    "message-4",
  ])
  expect(root.state.hasMore()).toBe(false)
  root.dispose()
})

test("a history watermark mismatch discards pages and falls back to an authoritative bounded resnapshot", async () => {
  let snapshotReads = 0
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("bounded-snapshot")) {
      snapshotReads += 1
      return Response.json(
        snapshotReads === 1
          ? snapshotCreate([messageStepCreate("message-old", 3)])
          : snapshotCreate([messageStepCreate("message-new", 5)], { cursor: null, throughSeq: 12 }),
      )
    }
    return Response.json({
      hasMore: false,
      nextCursor: null,
      semanticSteps: [messageStepCreate("message-mismatched", 2)],
      throughSeq: 9,
    })
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({ fetch, sessionId: () => "session-1" }),
  }))

  await settle()
  await root.state.loadOlder()
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["message-old"])
  await settle()

  expect(snapshotReads).toBe(2)
  expect(root.state.throughSeq()).toBe(12)
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["message-new"])
  expect(root.state.isOlderError()).toBe(false)
  root.dispose()
})

test("changing selection clears the previous bounded snapshot before the next read completes", async () => {
  const [sessionId, sessionIdSet] = createSignal("session-1")
  let sessionTwoResolve: ((response: Response) => void) | undefined
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("session-2")) return new Promise<Response>((resolve) => (sessionTwoResolve = resolve))
    return Response.json(snapshotCreate([], { cursor: null }))
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({ fetch, sessionId }),
  }))

  await settle()
  expect(root.state.snapshot()?.session.id).toBe("session-1")
  sessionIdSet("session-2")
  await settle()
  expect(root.state.snapshot()).toBeUndefined()
  expect(root.state.semanticSteps()).toEqual([])

  sessionTwoResolve?.(Response.json(snapshotCreate([], { cursor: null, sessionId: "session-2" })))
  await settle()
  expect(root.state.snapshot()?.session.id).toBe("session-2")
  root.dispose()
})
