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
  input: { cursor?: string | null; sessionId?: string; throughPosition?: number } = {},
) => ({
  detailCursor: `detail-${input.sessionId ?? "session-1"}-${input.throughPosition ?? 10}`,
  hasMore: input.cursor !== null,
  latestAnswer: null,
  olderCursor: input.cursor === undefined ? "cursor-older-1" : input.cursor,
  semanticSteps,
  session: sessionCreate(input.sessionId),
  state: { input: null, run: null },
  throughPosition: input.throughPosition ?? 10,
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
        throughPosition: 10,
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

test("supersedes a concurrent authoritative snapshot refresh with one trailing replacement", async () => {
  let snapshotReads = 0
  const releaseRefreshes: Array<(response: Response) => void> = []
  const fetch = async (input: RequestInfo | URL) => {
    if (!String(input).endsWith("bounded-snapshot")) return Response.json({})
    snapshotReads += 1
    if (snapshotReads === 1) return Response.json(snapshotCreate([messageStepCreate("initial", 1)]))
    return new Promise<Response>((resolve) => {
      releaseRefreshes.push(resolve)
    })
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({ fetch, sessionId: () => "session-1" }),
  }))

  await settle()
  const firstRefresh = root.state.refresh()
  const secondRefresh = root.state.refresh()
  const thirdRefresh = root.state.refresh()

  expect(firstRefresh).toBe(secondRefresh)
  expect(firstRefresh).toBe(thirdRefresh)
  expect(snapshotReads).toBe(2)
  releaseRefreshes[0]?.(Response.json(snapshotCreate([messageStepCreate("running", 2)])))
  await settle()

  expect(snapshotReads).toBe(3)
  const fourthRefresh = root.state.refresh()
  expect(fourthRefresh).toBe(firstRefresh)
  releaseRefreshes[1]?.(Response.json(snapshotCreate([messageStepCreate("terminal", 3)])))
  await firstRefresh

  expect(snapshotReads).toBe(3)
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["terminal"])
  root.dispose()
})

test("disposal settles a queued authoritative refresh without applying its late response", async () => {
  let snapshotReads = 0
  let releaseRefresh: ((response: Response) => void) | undefined
  const fetch = async (input: RequestInfo | URL) => {
    if (!String(input).endsWith("bounded-snapshot")) return Response.json({})
    snapshotReads += 1
    if (snapshotReads === 1) return Response.json(snapshotCreate([messageStepCreate("initial", 1)]))
    return new Promise<Response>((resolve) => {
      releaseRefresh = resolve
    })
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({ fetch, sessionId: () => "session-1" }),
  }))

  await settle()
  const activeRefresh = root.state.refresh()
  const queuedRefresh = root.state.refresh()
  root.dispose()

  let refreshesSettled = false
  void Promise.all([activeRefresh, queuedRefresh]).then(() => {
    refreshesSettled = true
  })
  await settle()
  expect(refreshesSettled).toBe(true)
  expect(snapshotReads).toBe(2)

  let postDisposeRefreshSettled = false
  void root.state.refresh().then(() => {
    postDisposeRefreshSettled = true
  })
  await settle()
  expect(postDisposeRefreshSettled).toBe(true)
  expect(snapshotReads).toBe(2)

  releaseRefresh?.(Response.json(snapshotCreate([messageStepCreate("stale", 2)])))
  await settle()
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["initial"])
})

test("deduplicates page overlap by stable identity and keeps the snapshot position immutable", async () => {
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("bounded-snapshot")) return Response.json(snapshotCreate([messageStepCreate("shared", 5)]))
    return Response.json({
      hasMore: false,
      nextCursor: null,
      semanticSteps: [messageStepCreate("older", 3), messageStepCreate("shared", 4)],
      throughPosition: 10,
    })
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({ fetch, sessionId: () => "session-1" }),
  }))

  await settle()
  await root.state.loadOlder()

  const steps = root.state.semanticSteps()
  expect(steps.map((step) => step.id)).toEqual(["older", "shared"])
  expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length)
  expect(steps.find((step) => step.id === "shared")?.sequence).toBe(5)
  root.dispose()
})

test("resnapshots instead of disabling pagination when entry retention overflows", async () => {
  const historyRequests: string[] = []
  let snapshotReads = 0
  let releaseResnapshot: ((response: Response) => void) | undefined
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("bounded-snapshot")) {
      snapshotReads += 1
      if (snapshotReads === 1) return Response.json(snapshotCreate([messageStepCreate("message-5", 5)]))
      return new Promise<Response>((resolve) => (releaseResnapshot = resolve))
    }
    historyRequests.push(url)
    return Response.json({
      hasMore: true,
      nextCursor: "cursor-older-2",
      semanticSteps: [messageStepCreate("message-3", 3), messageStepCreate("message-4", 4)],
      throughPosition: 10,
    })
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      fetch,
      maximumEntries: 2,
      sessionId: () => "session-1",
    }),
  }))

  await settle()
  await root.state.loadOlder()
  await settle()
  expect(snapshotReads).toBe(2)
  expect(historyRequests).toHaveLength(1)
  expect(root.state.hasMore()).toBe(true)
  expect(root.state.isOlderError()).toBe(true)

  releaseResnapshot?.(
    Response.json(snapshotCreate([messageStepCreate("message-new", 6)], { cursor: null, throughPosition: 12 })),
  )
  await settle()
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["message-new"])
  expect(root.state.hasMore()).toBe(false)
  root.dispose()
})

test("uses serialized UTF-8 bytes when retention overflows", async () => {
  const snapshotStep = messageStepCreate("message-3", 3)
  const overflowingStep = { ...messageStepCreate("message-2", 2), summary: "😀" }
  const maximumBytes = JSON.stringify(snapshotStep).length + JSON.stringify(overflowingStep).length
  expect(
    new TextEncoder().encode(JSON.stringify(snapshotStep)).byteLength +
      new TextEncoder().encode(JSON.stringify(overflowingStep)).byteLength,
  ).toBeGreaterThan(maximumBytes)
  const historyRequests: string[] = []
  let snapshotReads = 0
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("bounded-snapshot")) {
      snapshotReads += 1
      return Response.json(
        snapshotReads === 1
          ? snapshotCreate([snapshotStep])
          : snapshotCreate([messageStepCreate("message-new", 5)], { cursor: null, throughPosition: 12 }),
      )
    }
    historyRequests.push(url)
    return Response.json({
      hasMore: true,
      nextCursor: "cursor-older-2",
      semanticSteps: [overflowingStep],
      throughPosition: 10,
    })
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      fetch,
      maximumBytes,
      sessionId: () => "session-1",
    }),
  }))

  await settle()
  await root.state.loadOlder()
  await settle()
  expect(snapshotReads).toBe(2)
  expect(historyRequests).toHaveLength(1)
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["message-new"])
  expect(root.state.hasMore()).toBe(false)
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
        throughPosition: 10,
      })
    secondPageAttempts += 1
    if (secondPageAttempts === 1) return new Response("", { status: 503, statusText: "Unavailable" })
    return Response.json({
      hasMore: false,
      nextCursor: null,
      semanticSteps: [messageStepCreate("message-1", 1), messageStepCreate("message-2", 2)],
      throughPosition: 10,
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
          : snapshotCreate([messageStepCreate("message-new", 5)], { cursor: null, throughPosition: 12 }),
      )
    }
    return Response.json({
      hasMore: false,
      nextCursor: null,
      semanticSteps: [messageStepCreate("message-mismatched", 2)],
      throughPosition: 9,
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
  expect(root.state.throughPosition()).toBe(12)
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

test("ignores late snapshot responses across an account-session switch and switch-back", async () => {
  const [userId, userIdSet] = createSignal("user-a")
  const responses: Array<(response: Response) => void> = []
  const fetch = async () => new Promise<Response>((resolve) => responses.push(resolve))
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({ fetch, sessionId: () => "session-1", userId }),
  }))

  await settle()
  expect(responses).toHaveLength(1)
  userIdSet("user-b")
  await settle()
  expect(responses).toHaveLength(2)
  userIdSet("user-a")
  await settle()
  expect(responses).toHaveLength(3)

  responses[1]?.(Response.json(snapshotCreate([messageStepCreate("account-b", 2)], { sessionId: "session-1" })))
  responses[0]?.(Response.json(snapshotCreate([messageStepCreate("account-a-old", 1)])))
  await settle()
  expect(root.state.snapshot()).toBeUndefined()

  responses[2]?.(Response.json(snapshotCreate([messageStepCreate("account-a-current", 3)])))
  await settle()
  expect(root.state.snapshot()?.semanticSteps.map((step) => step.id)).toEqual(["account-a-current"])
  root.dispose()
})
