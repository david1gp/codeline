import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { EventFeedState } from "../src/stream/client/eventFeedStateCreate.js"

mock.module("solid-js", () => solidRuntime)
const { sessionStreamStateCreate } = await import("../src/ui/sessionStreamStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const feedStateCreate = (): EventFeedState => ({
  activeRuns: new Map([
    [
      "client-run-1",
      {
        checkpoint: null,
        deltaTextByKind: { text: "hello", thinking: "", tool: "" },
        deltas: [{ delta: "hello", deltaKind: "text", messageId: null, sequence: 1 }],
        lastSequence: 1,
        partialText: "hello",
        phase: "active",
        runId: "client-run-1",
        sessionId: "session-1",
        superseded: false,
        terminalStatus: null,
      },
    ],
  ]),
  asOfCursor: null,
  lastEventId: null,
  resourceRevisions: new Map(),
  settledCacheKeys: [],
  staleResources: new Map(),
  status: { asOfCursor: null, lastEventId: null, status: "connected" },
})

test("stream state derives active output from the shared event feed and preserves durable-before-in-flight ordering", async () => {
  await createRoot(async (dispose) => {
    const [enabled, setEnabled] = createSignal(false)
    const [sessionId] = createSignal("session-1")
    const [inFlightMessages, setInFlightMessages] = createSignal<ReadonlyArray<{ content: string; role: string }>>([])
    const [feedState] = createSignal(feedStateCreate())
    const state = sessionStreamStateCreate({
      delegations: () => [],
      eventFeedState: feedState,
      inFlightMessages,
      inFlightRunId: () => "client-run-1",
      isEnabled: enabled,
      sessionId,
    })

    await tick()
    expect(state.groups()).toEqual([])
    expect(state.isLoading()).toBe(false)

    setEnabled(true)
    setInFlightMessages([{ content: "pending", role: "assistant" }])
    await tick()

    expect(state.isLoading()).toBe(false)
    expect(state.groups().map((group) => group.streamId)).toEqual(["client-run-1", "in-flight"])
    expect(state.groups()[0]?.entries).toEqual([
      { detail: "hello", id: "client-run-1:1", kind: "output", label: "Output" },
    ])
    expect(state.groups()[1]?.entries[0]?.detail).toBe("pending")

    state.revalidate()
    expect(state.groups()[0]?.entries).toEqual([
      { detail: "hello", id: "client-run-1:1", kind: "output", label: "Output" },
    ])

    dispose()
  })
})

test("stream state does not expose a failed HTTP read as loading forever", async () => {
  await createRoot(async (dispose) => {
    const state = sessionStreamStateCreate({
      delegations: () => [],
      inFlightMessages: () => [],
      inFlightRunId: () => null,
      isEnabled: () => true,
      sessionId: () => "session-1",
    })

    await tick()
    expect(state.groups()).toEqual([])
    expect(state.isLoading()).toBe(false)

    dispose()
  })
})

test("stream state keeps durable identity while deriving changing in-flight rows independently", async () => {
  await createRoot(async (dispose) => {
    const [inFlightMessages, setInFlightMessages] = createSignal<ReadonlyArray<{ content: string; role: string }>>([
      { content: "pending-1", role: "assistant" },
    ])
    const [feedState] = createSignal(feedStateCreate())
    const state = sessionStreamStateCreate({
      delegations: () => [],
      eventFeedState: feedState,
      inFlightMessages,
      inFlightRunId: () => "client-run-1",
      isEnabled: () => true,
      sessionId: () => "session-1",
    })

    await tick()
    const initial = state.groups()
    const durableEntry = initial[0]?.entries[0]
    const initialInFlightEntry = initial[1]?.entries[0]

    setInFlightMessages([{ content: "pending-2", role: "assistant" }])
    await tick()
    const updated = state.groups()

    expect(updated[0]?.entries[0]).toBe(durableEntry)
    expect(updated[1]?.entries[0]?.detail).toBe("pending-2")
    expect(updated[1]?.entries[0]).not.toBe(initialInFlightEntry)

    dispose()
  })
})

test("bounded active output is followed only by feed deltas after throughSeq", async () => {
  await createRoot(async (dispose) => {
    const feed = feedStateCreate()
    const run = feed.activeRuns.get("client-run-1")
    if (run === undefined) throw new Error("missing fixture run")
    run.deltas = [
      { delta: " duplicate", deltaKind: "text", messageId: null, sequence: 4 },
      { delta: " tail", deltaKind: "text", messageId: null, sequence: 6 },
    ]
    run.lastSequence = 6
    run.partialText = "Working duplicate tail"

    const state = sessionStreamStateCreate({
      boundedState: () => ({
        input: null,
        run: {
          lastSequence: 4,
          partialText: "Working",
          runId: "client-run-1",
          sessionId: "session-1",
          status: "running",
        },
      }),
      delegations: () => [],
      eventFeedState: () => feed,
      inFlightMessages: () => [],
      inFlightRunId: () => null,
      isEnabled: () => true,
      sessionId: () => "session-1",
      throughSeq: () => 5,
    })

    await tick()
    expect(state.groups()[0]?.entries.map((entry) => entry.detail)).toEqual(["Working tail"])
    expect(state.groups()[0]?.entries[0]?.id).toBe("client-run-1:bounded:5")
    dispose()
  })
})
