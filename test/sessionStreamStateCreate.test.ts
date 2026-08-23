import { expect, mock, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
const { sessionStreamStateCreate } = await import("../src/ui/sessionStreamStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const run = {
  attempts: [{ id: "attempt-1", ordinal: 1, status: "succeeded", streamId: "stream-1" }],
  clientRunId: "client-run-1",
  createdAt: 1,
  id: "run-1",
  snapshot: { target: { agentId: "agent-1" } },
  status: "succeeded",
  streamId: "run-stream-1",
}

const event = {
  createdAt: 1,
  eventType: "text_delta",
  id: "event-1",
  payload: { delta: "hello" },
  sequence: 1,
  streamId: "stream-1",
}

test("stream state stays lazy, loads HTTP rows, and preserves durable-before-in-flight ordering", async () => {
  await createRoot(async (dispose) => {
    const [enabled, setEnabled] = createSignal(false)
    const [sessionId] = createSignal("session-1")
    const [inFlightMessages, setInFlightMessages] = createSignal<ReadonlyArray<{ content: string; role: string }>>([])
    let loads = 0
    const state = sessionStreamStateCreate({
      delegations: () => [],
      inFlightMessages,
      inFlightRunId: () => "client-run-1",
      isEnabled: enabled,
      load: async () => {
        loads += 1
        return createResult({ events: [event], runs: [run] })
      },
      sessionId,
    })

    await tick()
    expect(loads).toBe(0)
    expect(state.groups()).toEqual([])
    expect(state.isLoading()).toBe(false)

    setEnabled(true)
    setInFlightMessages([{ content: "pending", role: "assistant" }])
    expect(state.isLoading()).toBe(true)
    await tick()

    expect(loads).toBe(1)
    expect(state.isLoading()).toBe(false)
    expect(state.groups().map((group) => group.streamId)).toEqual(["stream-1", "in-flight"])
    expect(state.groups()[0]?.entries).toEqual([{ detail: "hello", id: "event-1", kind: "output", label: "Output" }])
    expect(state.groups()[1]?.entries[0]?.detail).toBe("pending")

    state.revalidate()
    expect(state.groups()[0]?.entries).toEqual([{ detail: "hello", id: "event-1", kind: "output", label: "Output" }])
    await tick()
    expect(loads).toBe(2)

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
      load: async () => createResultError("sessionStreamLoad", "The stream read failed."),
      sessionId: () => "session-1",
    })

    await tick()
    expect(state.groups()).toEqual([])
    expect(state.isLoading()).toBe(false)

    dispose()
  })
})
