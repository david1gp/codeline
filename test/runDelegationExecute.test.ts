import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import type { ExecutionStreamEvent } from "../src/stream/schema/executionStreamEventSchema.js"
import { runDelegationExecute } from "../src/run/actions/runDelegationExecute.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { runTable } from "../src/run/db/runTable.js"

const userId = "delegation-test-user"
const sessionId = "delegation-test-session"
const parentDeadline = new Date("2030-01-01T00:01:00.000Z")
const snapshot = {
  configuration: { model: "deterministic-model", provider: "deterministic" as const },
  configurationRevision: "delegation-test-revision",
  target: { agentId: "delegation-test-agent", serverId: "delegation-test-server" },
}

function runCreate(
  status: string,
  budget = { maxAttempts: 1, maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 60_000 },
) {
  return {
    budget,
    cancellationKind: null,
    cancellationRequestedAt: null,
    cancellationSourceRunId: null,
    clientRunId: "child-client-run",
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    deadlineAt: parentDeadline,
    failure: null,
    finishedAt: null,
    id: "child-run",
    sessionId,
    snapshot,
    startedAt: null,
    status,
    streamId: "child-run-stream",
    updatedAt: new Date("2030-01-01T00:00:00.000Z"),
    userId,
  } as unknown as typeof runTable.$inferSelect
}

function attemptCreate(runId: string, ordinal: number, status: string) {
  return {
    budget: { maxAttempts: 1, maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 60_000 },
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    failure: null,
    finishedAt: null,
    id: `child-attempt-${ordinal}`,
    ordinal,
    runId,
    sessionId,
    snapshot,
    startedAt: null,
    status,
    streamId: `child-attempt-${ordinal}-stream`,
    updatedAt: new Date("2030-01-01T00:00:00.000Z"),
    userId,
  } as unknown as typeof attemptTable.$inferSelect
}

function delegationCreate(finalizedResult: typeof runDelegationTable.$inferSelect.finalizedResult = null) {
  return {
    childRunId: "child-run",
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    delegationKey: "delegation-key",
    depth: 1,
    finalizedResult,
    id: "delegation-id",
    parentAttemptId: "parent-attempt",
    parentRunId: "parent-run",
    rootOrdinal: 1,
    rootRunId: "parent-run",
    sessionId,
    task: "private child task",
    updatedAt: new Date("2030-01-01T00:00:00.000Z"),
    userId,
  } as unknown as typeof runDelegationTable.$inferSelect
}

function parentCreate() {
  const parentRun = runCreate("running")
  parentRun.id = "parent-run"
  parentRun.clientRunId = "parent-client-run"
  parentRun.streamId = "parent-stream"
  const parentAttempt = attemptCreate(parentRun.id, 1, "running")
  parentAttempt.id = "parent-attempt"
  parentAttempt.streamId = "parent-attempt-stream"
  return { parentAttempt, parentRun }
}

function eventText(delta: string): ExecutionStreamEvent {
  return { eventType: "text_delta", payload: { delta } }
}

function eventTerminal(status: "completed" | "error", code?: string): ExecutionStreamEvent {
  return {
    eventType: "terminal",
    payload: {
      ...(code === undefined ? {} : { code }),
      message: status === "error" ? "The child attempt failed." : undefined,
      status,
    },
  }
}

function harnessCreate(options: { budget?: Parameters<typeof runCreate>[1]; finalized?: boolean } = {}) {
  const parent = parentCreate()
  const childRun = runCreate("accepted", options.budget)
  const childAttempt = attemptCreate(childRun.id, 1, "accepted")
  const delegation = delegationCreate(options.finalized ? { status: "succeeded", text: "replayed" } : null)
  const events: Array<{ eventType: string; payload: unknown; streamId: string }> = []
  const messages: Array<{ content: string; role: string }> = []
  const calls: number[] = []
  let clock = new Date("2030-01-01T00:00:01.000Z")
  let registeredController: AbortController | undefined
  let streamFactory: (attempt: typeof childAttempt, signal: AbortSignal) => AsyncIterable<ExecutionStreamEvent> =
    async function* () {
      yield eventText("completed")
      yield eventTerminal("completed")
    }

  const optionsForAction: Parameters<typeof runDelegationExecute>[1] = {
    attemptStreamCreate: ({ attempt, signal }) => {
      calls.push(attempt.ordinal)
      return streamFactory(attempt, signal)
    },
    cancellationRegister: ({ controller }) => {
      registeredController = controller
      return () => {
        if (registeredController === controller) registeredController = undefined
      }
    },
    childCreate: async () => createResult({ attempt: childAttempt, created: true, delegation, run: childRun }),
    delegationFinalize: async (_delegationId, result) => {
      delegation.finalizedResult = result
      childRun.status = result.status
      childAttempt.status = result.status
      childRun.failure = "failure" in result ? result.failure : null
      childAttempt.failure = childRun.failure
      return createResult({})
    },
    now: () => clock,
    retryAttemptCreate: async () => {
      const nextOrdinal = childAttempt.ordinal + 1
      childAttempt.id = `child-attempt-${nextOrdinal}`
      childAttempt.ordinal = nextOrdinal
      childAttempt.status = "accepted"
      childAttempt.failure = null
      childAttempt.streamId = `child-attempt-${nextOrdinal}-stream`
      childRun.status = "accepted"
      childRun.failure = null
      return createResult({ attempt: childAttempt, created: true, run: childRun })
    },
    runTransition: async (_runId, input) => {
      childRun.status = input.status
      childAttempt.status = input.status
      childRun.failure = input.failure ?? null
      childAttempt.failure = childRun.failure
      return createResult({})
    },
    streamAppend: async (input) => {
      events.push({ eventType: input.eventType, payload: input.payload, streamId: input.streamId })
      return createResult({})
    },
    setTimeout: (handler, _timeout) => {
      if (options.finalized !== true) return globalThis.setTimeout(handler, 60_000)
      return globalThis.setTimeout(handler, 60_000)
    },
  }

  return {
    childAttempt,
    childRun,
    delegation,
    events,
    messages,
    optionsForAction,
    parent,
    setClock(value: Date) {
      clock = value
    },
    setStreamFactory(factory: typeof streamFactory) {
      streamFactory = factory
    },
    cancel() {
      registeredController?.abort()
    },
    calls,
  }
}

async function execute(harness: ReturnType<typeof harnessCreate>) {
  return runDelegationExecute(
    {
      delegationKey: "delegation-key",
      parentAttempt: harness.parent.parentAttempt,
      parentRun: harness.parent.parentRun,
      task: "private child task",
    },
    harness.optionsForAction,
  )
}

test("executes a child successfully with a bounded private result", async () => {
  const harness = harnessCreate()
  harness.setStreamFactory(async function* () {
    yield eventText("x".repeat(20_000))
    yield eventTerminal("completed")
  })

  const result = await execute(harness)

  expect(result).toMatchObject({ success: true, data: { status: "succeeded", text: "x".repeat(16_384) } })
  expect(harness.calls).toEqual([1])
  expect(harness.events.every((event) => event.streamId === "child-attempt-1-stream")).toBe(true)
  expect(harness.messages).toHaveLength(0)
})

test("retries a retryable child failure and succeeds on the next attempt", async () => {
  const harness = harnessCreate({
    budget: { maxAttempts: 2, maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 60_000 },
  })
  harness.setStreamFactory(async function* (attempt) {
    if (attempt.ordinal === 1) {
      yield eventText("first attempt")
      yield eventTerminal("error", "provider_failed")
      return
    }
    yield eventText("second attempt")
    yield eventTerminal("completed")
  })

  const result = await execute(harness)

  expect(result).toMatchObject({ success: true, data: { status: "succeeded", text: "second attempt" } })
  expect(harness.calls).toEqual([1, 2])
  expect(harness.events.map((event) => event.streamId)).toEqual([
    "child-attempt-1-stream",
    "child-attempt-1-stream",
    "child-attempt-2-stream",
    "child-attempt-2-stream",
  ])
})

test("finalizes exhausted retryable failure without another attempt", async () => {
  const harness = harnessCreate({
    budget: { maxAttempts: 2, maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 60_000 },
  })
  harness.setStreamFactory(async function* () {
    yield eventText("failed")
    yield eventTerminal("error", "provider_failed")
  })

  const result = await execute(harness)

  expect(result).toMatchObject({ success: true, data: { status: "failed", text: "failed" } })
  expect(harness.calls).toEqual([1, 2])
  expect(harness.delegation.finalizedResult).toMatchObject({ status: "failed" })
  expect(harness.messages).toHaveLength(0)
})

test("cancellation aborts a child attempt and finalizes the delegation", async () => {
  const harness = harnessCreate()
  let startedResolve: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve
  })
  harness.setStreamFactory(async function* (_attempt, signal) {
    startedResolve()
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve()
      else signal.addEventListener("abort", () => resolve(), { once: true })
    })
  })
  const resultPromise = execute(harness)
  await started
  harness.cancel()

  const result = await resultPromise

  expect(result).toMatchObject({ success: true, data: { status: "aborted", failure: { code: "child_aborted" } } })
  expect(harness.calls).toEqual([1])
  expect(harness.messages).toHaveLength(0)
})

test("deadline aborts before child execution and does not retry", async () => {
  const harness = harnessCreate()
  harness.optionsForAction.setTimeout = (handler, _timeout) => {
    handler()
    return globalThis.setTimeout(() => undefined, 60_000)
  }

  const result = await execute(harness)

  expect(result).toMatchObject({
    success: true,
    data: { failure: { code: "child_deadline_exceeded" }, status: "aborted" },
  })
  expect(harness.calls).toHaveLength(0)
})

test("returns a finalized replay without registering or executing a child", async () => {
  const harness = harnessCreate({ finalized: true })
  let registrations = 0
  const originalRegister = harness.optionsForAction.cancellationRegister
  harness.optionsForAction.cancellationRegister = (input) => {
    registrations += 1
    return originalRegister(input)
  }

  const result = await execute(harness)

  expect(result).toEqual({ success: true, data: { status: "succeeded", text: "replayed" } })
  expect(harness.calls).toHaveLength(0)
  expect(registrations).toBe(0)
  expect(harness.events).toHaveLength(0)
})

test("keeps child events isolated from the parent stream and visible transcript", async () => {
  const harness = harnessCreate()
  const result = await execute(harness)

  expect(result.success).toBe(true)
  expect(harness.events.length).toBeGreaterThan(0)
  expect(harness.events.every((event) => event.streamId !== "parent-stream")).toBe(true)
  expect(harness.events.every((event) => event.streamId === "child-attempt-1-stream")).toBe(true)
  expect(harness.messages).toEqual([])
  expect(JSON.stringify(harness.messages)).not.toContain("private child task")
})
