import { expect, mock, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"
import type { SessionChatState } from "../src/ui/sessionChatStateCreate.js"

mock.module("solid-js", () => solidRuntime)
const { simulateInspectorStateCreate } = await import("../src/ui/simulate/simulateInspectorStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const chat = {
  attemptCount: () => 1,
  canSubmit: () => false,
  draft: () => "",
  draftUpdate: () => undefined,
  errorMessage: () => undefined,
  failures: () => [],
  isAborted: () => false,
  isBusy: () => false,
  isStopping: () => false,
  isThinking: () => false,
  keyDownHandle: (_event: KeyboardEvent) => undefined,
  pendingMessages: () => [],
  recoveryStatus: () => "idle" as const,
  stopHandle: () => undefined,
  submit: async () => undefined,
  submitHandle: (_event: Event) => undefined,
} satisfies SessionChatState

test("simulation inspector loads the latest HTTP run snapshot and filters replay events to its latest attempt", async () => {
  await createRoot(async (dispose) => {
    const state = simulateInspectorStateCreate({
      chat: () => chat,
      load: async (sessionId) => {
        expect(sessionId).toBe("session-1")
        return createResult({
          events: [
            { eventType: "old", streamId: "attempt-old" },
            { eventType: "RUN_STARTED", streamId: "attempt-new" },
            { eventType: "TEXT_MESSAGE_CONTENT", streamId: "attempt-new-2" },
            { eventType: "RUN_FINISHED", streamId: "attempt-new-2" },
          ],
          runs: [
            {
              attempts: [{ id: "old-attempt", ordinal: 1, status: "failed", streamId: "attempt-old" }],
              createdAt: 1,
              id: "run-old",
              status: "failed",
              streamId: "attempt-old",
            },
            {
              attempts: [
                { id: "new-attempt-2", ordinal: 2, status: "succeeded", streamId: "attempt-new-2" },
                { id: "new-attempt-1", ordinal: 1, status: "failed", streamId: "attempt-new" },
              ],
              cancellationKind: null,
              createdAt: 2,
              id: "run-new",
              status: "succeeded",
              streamId: "run-stream",
            },
          ],
        })
      },
      sessionId: () => "session-1",
    })

    expect(state.isLoading()).toBe(true)
    await tick()

    expect(state.isLoading()).toBe(false)
    expect(state.run()).toEqual({
      cancellationKind: null,
      id: "run-new",
      status: "succeeded",
      streamId: "run-stream",
    })
    expect(state.attempts()).toEqual([
      { id: "new-attempt-1", ordinal: 1, status: "failed", streamId: "attempt-new" },
      { id: "new-attempt-2", ordinal: 2, status: "succeeded", streamId: "attempt-new-2" },
    ])
    expect(state.streamId()).toBe("attempt-new-2")
    expect(state.eventTotal()).toBe(2)
    expect(state.eventCounts()).toEqual([
      { count: 1, eventType: "RUN_FINISHED" },
      { count: 1, eventType: "TEXT_MESSAGE_CONTENT" },
    ])

    dispose()
  })
})

test("simulation inspector keeps the empty backend state after an HTTP loader error", async () => {
  await createRoot(async (dispose) => {
    const state = simulateInspectorStateCreate({
      chat: () => chat,
      load: async () => createResultError("simulateInspectorLoad", "The snapshot failed."),
      sessionId: () => "session-1",
    })

    await tick()

    expect(state.isLoading()).toBe(false)
    expect(state.run()).toBeUndefined()
    expect(state.attempts()).toEqual([])
    expect(state.eventCounts()).toEqual([])
    expect(state.eventTotal()).toBe(0)
    expect(state.streamId()).toBeUndefined()

    dispose()
  })
})
