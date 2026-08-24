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
