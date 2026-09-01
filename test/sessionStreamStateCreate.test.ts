import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { SessionDetailEvent } from "../src/session/api/sessionDetailEventSchema.js"

mock.module("solid-js", () => solidRuntime)
const { sessionStreamStateCreate } = await import("../src/ui/sessionStreamStateCreate.js")

type DetailEntry = Extract<SessionDetailEvent, { eventType: "entry" }>

function toolEntry(changePosition = 2): DetailEntry {
  return {
    changePosition,
    entryId: "tool-entry-1",
    eventType: "entry",
    id: `cursor-${changePosition}`,
    kind: "tool",
    payload: {
      detailId: "tool-detail-1",
      kind: "tool",
      runId: "run-1",
      summary: "read · running",
      toolCallId: "tool-call-1",
      toolName: "read",
    },
    position: 2,
    sessionId: "session-1",
    sourceDetailId: "tool-call-1",
    sourceId: "run-1",
    sourceType: "tool",
  }
}

function terminalEntry(terminalKind: "cancelled" | "completed" | "failed" | "interrupted"): DetailEntry {
  return {
    changePosition: 8,
    entryId: `run-entry-${terminalKind}`,
    eventType: "entry",
    id: `cursor-${terminalKind}`,
    kind: "run",
    payload: {
      detailId: "run-1",
      kind: "run",
      status: terminalKind === "completed" ? "succeeded" : terminalKind === "failed" ? "failed" : "aborted",
      summary: `Run ${terminalKind}`,
      terminalKind,
    },
    position: 2,
    sessionId: "session-1",
    sourceDetailId: "",
    sourceId: "run-1",
    sourceType: "run",
  }
}

test("stream state derives selected detail independently from the global summary feed", () => {
  const [enabled, enabledSet] = createSignal(false)
  const [inFlightMessages, inFlightMessagesSet] = createSignal<ReadonlyArray<{ content: string; role: string }>>([])
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionStreamStateCreate({
      delegations: () => [],
      detailEntries: () => [toolEntry()],
      inFlightMessages,
      inFlightRunId: () => "run-1",
      isEnabled: enabled,
      sessionId: () => "session-1",
    }),
  }))

  expect(root.state.groups()).toEqual([])
  enabledSet(true)
  inFlightMessagesSet([{ content: "pending", role: "assistant" }])

  expect(root.state.groups().map((group) => group.streamId)).toEqual(["run-1", "in-flight"])
  expect(root.state.groups()[0]?.entries).toEqual([
    { detail: "tool-call-1", id: "tool-entry-1", kind: "tool", label: "read", status: "start" },
  ])
  expect(root.state.groups()[1]?.entries[0]?.detail).toBe("pending")
  root.dispose()
})

test("stream state uses bounded active output while selected detail handoff is empty", () => {
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionStreamStateCreate({
      boundedState: () => ({
        input: null,
        run: {
          lastSequence: 4,
          partialText: "Working",
          runId: "run-1",
          sessionId: "session-1",
          status: "running",
        },
      }),
      delegations: () => [],
      detailEntries: () => [],
      inFlightMessages: () => [],
      inFlightRunId: () => null,
      isEnabled: () => true,
      sessionId: () => "session-1",
    }),
  }))

  expect(root.state.groups()[0]?.entries).toEqual([
    { detail: "Working", id: "run-1:snapshot", kind: "output", label: "Output" },
  ])
  root.dispose()
})

test("stream state keeps durable selected-detail identity while in-flight rows change", () => {
  const [inFlightMessages, inFlightMessagesSet] = createSignal<ReadonlyArray<{ content: string; role: string }>>([
    { content: "pending-1", role: "assistant" },
  ])
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionStreamStateCreate({
      delegations: () => [],
      detailEntries: () => [toolEntry()],
      inFlightMessages,
      inFlightRunId: () => "run-1",
      isEnabled: () => true,
      sessionId: () => "session-1",
    }),
  }))
  const durable = root.state.groups()[0]?.entries[0]
  const initialInFlight = root.state.groups()[1]?.entries[0]

  inFlightMessagesSet([{ content: "pending-2", role: "assistant" }])
  expect(root.state.groups()[0]?.entries[0]).toBe(durable)
  expect(root.state.groups()[1]?.entries[0]?.detail).toBe("pending-2")
  expect(root.state.groups()[1]?.entries[0]).not.toBe(initialInFlight)
  root.dispose()
})

test("stream state excludes retained detail from another selected session", () => {
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionStreamStateCreate({
      delegations: () => [],
      detailEntries: () => [toolEntry()],
      inFlightMessages: () => [],
      inFlightRunId: () => null,
      isEnabled: () => true,
      sessionId: () => "session-2",
    }),
  }))

  expect(root.state.groups()).toEqual([])
  expect(root.state.isLoading()).toBe(false)
  root.dispose()
})

test("uses authoritative run entry identity and preserves every exact terminal kind", () => {
  for (const terminalKind of ["completed", "failed", "cancelled", "interrupted"] as const) {
    const entry = terminalEntry(terminalKind)
    const root = createRoot((dispose) => ({
      dispose,
      state: sessionStreamStateCreate({
        delegations: () => [],
        detailEntries: () => [entry],
        inFlightMessages: () => [],
        inFlightRunId: () => null,
        isEnabled: () => true,
        sessionId: () => "session-1",
      }),
    }))

    expect(root.state.groups()[0]).toMatchObject({
      entries: [{ id: entry.entryId, kind: "terminal", status: terminalKind }],
      status: terminalKind,
    })
    expect(root.state.groups()[0]?.entries[0]?.id).not.toContain(":terminal")
    root.dispose()

    const replaced = createRoot((dispose) => ({
      dispose,
      state: sessionStreamStateCreate({
        delegations: () => [],
        detailEntries: () => [],
        inFlightMessages: () => [],
        inFlightRunId: () => null,
        isEnabled: () => true,
        semanticSteps: () => [
          {
            detailId: "run-1",
            id: entry.entryId,
            kind: "run",
            sequence: entry.position,
            status: terminalKind === "completed" ? "succeeded" : terminalKind === "failed" ? "failed" : "aborted",
            summary: `Run ${terminalKind}`,
            terminalKind,
          },
        ],
        sessionId: () => "session-1",
      }),
    }))
    expect(replaced.state.groups()[0]?.entries).toEqual([
      { id: entry.entryId, kind: "terminal", label: "Terminal", status: terminalKind },
    ])
    replaced.dispose()
  }
})
