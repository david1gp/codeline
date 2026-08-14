import { expect, mock, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import type { SimulateScenarioSlug } from "../src/ui/simulate/simulateScenario.js"
import { simulateScenarioFixtures } from "../src/ui/simulate/simulateScenarioFixtures.js"

mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(initialValue: T) => {
    let value = initialValue
    return {
      get: () => value,
      set: (nextValue: T) => {
        value = nextValue
      },
    }
  },
}))

const { simulateSimulatorStateCreate } = await import("../src/ui/simulate/simulateSimulatorStateCreate.js")

const scheduler = {
  clearTimeout: (_handle: unknown) => {},
  setTimeout: (_callback: () => void, _delayMs: number) => 0,
}

function simulatorCreate(slug: SimulateScenarioSlug) {
  return createRoot((dispose) => ({
    dispose,
    state: simulateSimulatorStateCreate(simulateScenarioFixtures[slug], { scheduler }),
  }))
}

test("simulator emits streaming events in order and transitions to succeeded", () => {
  const root = simulatorCreate("streaming")

  expect(root.state.snapshot().phase).toBe("idle")
  root.state.play()
  expect(root.state.snapshot().phase).toBe("running")

  root.state.advance(119)
  expect(root.state.snapshot().events).toHaveLength(0)
  root.state.advance(1)
  root.state.advance(180)
  root.state.advance(180)
  root.state.advance(140)

  const snapshot = root.state.snapshot()
  expect(snapshot.events.map((emitted) => emitted.sequence)).toEqual([1, 2, 3, 4])
  expect(snapshot.events.map((emitted) => emitted.elapsedMs)).toEqual([120, 300, 480, 620])
  expect(snapshot.events.map((emitted) => emitted.event.eventType)).toEqual([
    "text_delta",
    "text_delta",
    "text_delta",
    "terminal",
  ])
  expect(snapshot.phase).toBe("succeeded")
  expect(snapshot.runStatus).toBe("succeeded")
  expect(snapshot.lastTermination).toBe("completed")
  expect(snapshot.attempts[0]).toMatchObject({ ordinal: 1, status: "succeeded" })

  root.dispose()
})

test("simulation preserves thinking and tool event sequencing", () => {
  const root = simulatorCreate("thinking-tools")
  root.state.play()

  for (const step of simulateScenarioFixtures["thinking-tools"].attempts[0]!.steps) root.state.advance(step.delayMs)

  const snapshot = root.state.snapshot()
  expect(snapshot.events.map((emitted) => emitted.event.eventType)).toEqual([
    "thinking_status",
    "tool_start",
    "tool_output",
    "tool_result",
    "tool_start",
    "tool_output",
    "tool_result",
    "tool_start",
    "tool_output",
    "tool_result",
    "tool_start",
    "tool_output",
    "tool_result",
    "tool_start",
    "tool_output",
    "tool_result",
    "thinking_status",
    "text_delta",
    "terminal",
  ])
  expect(snapshot.events.every((emitted, index) => emitted.sequence === index + 1)).toBe(true)
  expect(snapshot.phase).toBe("succeeded")

  root.dispose()
})

test("simulation retries a retryable failure and succeeds on the next attempt", () => {
  const root = simulatorCreate("retry-success")
  root.state.play()
  root.state.advance(130)
  root.state.advance(220)

  let snapshot = root.state.snapshot()
  expect(snapshot.phase).toBe("retrying")
  expect(snapshot.attempts[0]).toMatchObject({ ordinal: 1, status: "failed" })
  expect(snapshot.attempts[0]?.retryAdmission).toMatchObject({
    decision: "retry",
    nextAttemptOrdinal: 2,
    reason: "retryable_failure",
  })

  root.state.advance(239)
  expect(root.state.snapshot().attempts).toHaveLength(1)
  root.state.retry()
  expect(root.state.snapshot().phase).toBe("running")
  expect(root.state.snapshot().currentAttemptOrdinal).toBe(2)

  root.state.advance(220)
  root.state.advance(180)
  root.state.advance(140)

  snapshot = root.state.snapshot()
  expect(snapshot.phase).toBe("succeeded")
  expect(snapshot.attempts.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"])
  expect(snapshot.events.map((emitted) => emitted.attemptOrdinal)).toEqual([1, 1, 2, 2, 2])

  root.dispose()
})

test("simulation stops retrying when the attempt budget is exhausted", () => {
  const root = simulatorCreate("retry-exhausted")
  root.state.play()
  root.state.advance(140)
  root.state.advance(220)
  expect(root.state.snapshot().phase).toBe("retrying")

  root.state.advance(240)
  root.state.advance(220)
  root.state.advance(220)

  const snapshot = root.state.snapshot()
  expect(snapshot.phase).toBe("failed")
  expect(snapshot.lastTermination).toBe("error")
  expect(snapshot.lastFailure).toMatchObject({ code: "provider_unavailable" })
  expect(snapshot.attempts.map((attempt) => attempt.status)).toEqual(["failed", "failed"])
  expect(snapshot.attempts[1]?.retryAdmission).toMatchObject({
    decision: "terminal",
    reason: "attempt_budget_exhausted",
    remainingAttempts: 0,
  })

  root.dispose()
})

test("simulation records a terminal error without retrying", () => {
  const root = simulatorCreate("terminal-error")
  root.state.play()
  root.state.advance(160)

  const snapshot = root.state.snapshot()
  expect(snapshot.phase).toBe("failed")
  expect(snapshot.runStatus).toBe("failed")
  expect(snapshot.lastTermination).toBe("error")
  expect(snapshot.lastFailure).toEqual({
    code: "assistant_empty",
    message: "No assistant text was returned for the execution request.",
  })
  expect(snapshot.attempts).toHaveLength(1)
  expect(snapshot.attempts[0]?.retryAdmission).toMatchObject({ decision: "terminal", reason: "terminal_failure" })

  root.dispose()
})

test("simulation classifies a stream without a terminal event as an unexpected end", () => {
  const root = simulatorCreate("unexpected-end")
  root.state.play()
  root.state.advance(150)
  root.state.advance(220)

  const snapshot = root.state.snapshot()
  expect(snapshot.phase).toBe("unexpected_end")
  expect(snapshot.runStatus).toBe("failed")
  expect(snapshot.lastTermination).toBe("unexpected_end")
  expect(snapshot.lastFailure).toEqual({
    code: "stream_disconnected",
    message: "The deterministic stream ended before a terminal event.",
  })
  expect(snapshot.events.map((emitted) => emitted.event.eventType)).toEqual(["text_delta", "text_delta"])
  expect(snapshot.attempts[0]?.status).toBe("failed")

  root.dispose()
})

test("simulation pause and stop prevent further events and finish as aborted", () => {
  const root = simulatorCreate("cancellation")
  root.state.play()
  root.state.advance(140)
  root.state.pause()

  expect(root.state.snapshot().phase).toBe("paused")
  expect(root.state.snapshot().events).toHaveLength(1)
  root.state.advance(1000)
  expect(root.state.snapshot().events).toHaveLength(1)

  root.state.play()
  root.state.stop()

  let snapshot = root.state.snapshot()
  expect(snapshot.phase).toBe("aborted")
  expect(snapshot.runStatus).toBe("aborted")
  expect(snapshot.lastTermination).toBe("aborted")
  expect(snapshot.events.at(-1)).toMatchObject({
    attemptOrdinal: 1,
    event: {
      eventType: "terminal",
      payload: { code: "chat_interrupted", status: "aborted" },
    },
  })
  expect(snapshot.attempts[0]?.status).toBe("aborted")

  root.state.advance(1000)
  snapshot = root.state.snapshot()
  expect(snapshot.events).toHaveLength(2)

  root.dispose()
})
