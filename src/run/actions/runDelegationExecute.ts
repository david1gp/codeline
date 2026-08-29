import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"
import { executionStreamEventSchema } from "../../stream/schema/executionStreamEventSchema.js"
import { attemptTable } from "../db/attemptTable.js"
import { runDelegationTable } from "../db/runDelegationTable.js"
import { runTable } from "../db/runTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunChildCreateInput, runChildCreateInputSchema } from "../schema/runChildCreateInputSchema.js"
import { type RunDelegationResult, runDelegationResultSchema } from "../schema/runDelegationResultSchema.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import { runExecutionSnapshotSchema } from "../schema/runExecutionSnapshotSchema.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"
import type { RunRetryExecutionEvidence } from "../schema/runRetryExecutionEvidenceSchema.js"
import type { RunTransitionInput } from "../schema/runTransitionInputSchema.js"
import { runExecutionManifestChildResolve } from "./runExecutionManifestChildResolve.js"
import { runExecutionManifestToolDefaultsResolve } from "./runExecutionManifestToolDefaultsResolve.js"
import { runRetryAdmissionResolve } from "./runRetryAdmissionResolve.js"

const PRIVATE_RESULT_LIMIT = 16_384
const REUSED_RESULT_POLL_INTERVAL_MS = 50
const delegationFinalizationRetryableCodes = new Set<string>([
  runErrorCodes.attemptPersistenceFailed,
  runErrorCodes.persistFailed,
  runErrorCodes.transitionFailed,
])

type RunDelegationChild = {
  attempt: typeof attemptTable.$inferSelect
  created: boolean
  delegation: typeof runDelegationTable.$inferSelect
  run: typeof runTable.$inferSelect
}

type RunDelegationRetry = {
  attempt: typeof attemptTable.$inferSelect
  created: boolean
  run: typeof runTable.$inferSelect
}

type RunDelegationTransition = {
  attempt?: typeof attemptTable.$inferSelect
  run?: typeof runTable.$inferSelect
}

type RunDelegationProviderOutput = {
  append: (input: unknown) => Promise<Result<void>>
  finalize: (input: {
    failure?: { code: string; message: string }
    reason?: string
    status: "aborted" | "failed" | "succeeded"
  }) => Promise<Result<unknown>>
  flush: () => Promise<Result<void>>
  start: () => Promise<
    Result<{ attempt?: typeof attemptTable.$inferSelect; changed?: boolean; run?: typeof runTable.$inferSelect }>
  >
}

type RunDelegationExecuteOptions = {
  attemptStreamCreate: (input: {
    attempt: typeof attemptTable.$inferSelect
    run: typeof runTable.$inferSelect
    signal: AbortSignal
    task: string
  }) => AsyncIterable<ExecutionStreamEvent> | Promise<AsyncIterable<ExecutionStreamEvent>>
  cancellationRegister: (input: {
    controller: AbortController
    runId: string
    sessionId: string
    userId: string
  }) => () => void
  childCreate: (input: {
    delegationKey: string
    parentAttemptId: string
    parentRunId: string
    snapshot?: RunExecutionSnapshot
    task: string
  }) => Promise<Result<RunDelegationChild>>
  delegationFinalize: (delegationId: string, result: RunDelegationResult) => Promise<Result<unknown>>
  retryAttemptCreate: (
    runId: string,
    options: { executionEvidence: RunRetryExecutionEvidence; now: () => Date },
  ) => Promise<Result<RunDelegationRetry>>
  runTransition: (runId: string, input: RunTransitionInput) => Promise<Result<RunDelegationTransition>>
  providerOutputCreate: (input: { requestId: string; runId: string; sessionId: string }) => RunDelegationProviderOutput
  clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void
  now?: () => Date
  setTimeout?: (handler: () => void, timeout: number) => ReturnType<typeof setTimeout>
}

type RunDelegationExecuteInput = {
  delegationKey: string
  parentAttempt: typeof attemptTable.$inferSelect
  parentRun: typeof runTable.$inferSelect
  childSnapshot?: unknown
  task: string
}

type RunDelegationAttemptOutcome = {
  executionEvidence: RunRetryExecutionEvidence
  failure: RunFailureMetadata | undefined
  status: "aborted" | "failed" | "succeeded"
  text: string
}

type RunDelegationAbortKind = "cancelled" | "deadline"

function runDelegationFailureCreate(code: string, message: string): RunFailureMetadata {
  return { code: code.slice(0, 100), message: message.trim().slice(0, 2_000) || "The delegated child run failed." }
}

function runDelegationJsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(runDelegationJsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${runDelegationJsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

function runDelegationChildSnapshotPolicyValidate(
  parentRun: typeof runTable.$inferSelect,
  childSnapshot: RunExecutionSnapshot | undefined,
): Result<void> {
  const op = "runDelegationExecute"
  if (childSnapshot === undefined) return createResult(undefined)
  const parentSnapshot = v.safeParse(runExecutionSnapshotSchema, parentRun.snapshot)
  if (!parentSnapshot.success)
    return runResultCreateError(op, "The parent execution snapshot is invalid.", runErrorCodes.childSnapshotInvalid)
  if (parentSnapshot.output.executionManifest === undefined && childSnapshot.executionManifest === undefined)
    return createResult(undefined)
  if (childSnapshot.executionManifest === undefined)
    return runResultCreateError(
      op,
      "The explicit child execution manifest is required.",
      runErrorCodes.childToolEscalation,
    )
  if (childSnapshot.target.serverId !== parentSnapshot.output.target.serverId)
    return runResultCreateError(
      op,
      "The child execution snapshot server does not match the parent.",
      runErrorCodes.childTargetMismatch,
    )
  const expectedManifest = runExecutionManifestChildResolve(
    parentSnapshot.output.executionManifest,
    childSnapshot.target.agentId,
  )
  if (!expectedManifest.success) return expectedManifest
  if (
    runDelegationJsonCanonicalize(childSnapshot.executionManifest) !==
    runDelegationJsonCanonicalize(expectedManifest.data)
  )
    return runResultCreateError(
      op,
      "The explicit child execution manifest is not the persisted selectable-subagent manifest.",
      runErrorCodes.childToolEscalation,
    )
  const configurationTools = runExecutionManifestToolDefaultsResolve(
    childSnapshot.executionManifest.tools.primary.tools,
  )
  if (
    runDelegationJsonCanonicalize(childSnapshot.configuration.tools) !==
    runDelegationJsonCanonicalize(configurationTools)
  )
    return runResultCreateError(
      op,
      "The child configuration tools do not match the immutable execution manifest.",
      runErrorCodes.childToolEscalation,
    )
  return createResult(undefined)
}

function runDelegationResultCreate(
  status: RunDelegationAttemptOutcome["status"],
  text: string,
  failure?: RunFailureMetadata,
): Result<RunDelegationResult> {
  const op = "runDelegationExecute"
  const candidate = failure === undefined ? { status, text } : { failure, status, text }
  const parsed = v.safeParse(runDelegationResultSchema, candidate)
  if (!parsed.success)
    return runResultCreateError(op, "The delegated child result is invalid.", runErrorCodes.delegationInvalid)
  return createResult(parsed.output)
}

function runDelegationFinalizedResultResolve(
  delegation: typeof runDelegationTable.$inferSelect,
): Result<RunDelegationResult> {
  const op = "runDelegationExecute"
  if (delegation.finalizedResult === null)
    return runResultCreateError(op, "The delegated child result is not finalized.", runErrorCodes.terminalResultMissing)
  const finalized = v.safeParse(runDelegationResultSchema, delegation.finalizedResult)
  if (!finalized.success)
    return runResultCreateError(op, "The finalized delegation result is invalid.", runErrorCodes.delegationInvalid)
  return createResult(finalized.output)
}

function runDelegationParentAdmissionActive(input: RunDelegationExecuteInput): boolean {
  return (
    input.parentRun.status === "running" &&
    input.parentAttempt.status === "running" &&
    input.parentRun.cancellationRequestedAt === null
  )
}

async function runDelegationChildAdmissionAbortFinalize(
  child: RunDelegationChild,
  options: RunDelegationExecuteOptions,
): Promise<Result<RunDelegationResult>> {
  const failure = runDelegationAbortFailureCreate("cancelled")
  const result = runDelegationResultCreate("aborted", "", failure)
  if (!result.success) return result
  const finalized = await runDelegationFinalizationRun(child.delegation.id, result.data, options)
  if (!finalized.success) return finalized
  return result
}

function runDelegationNowResolve(options: RunDelegationExecuteOptions): Result<Date> {
  const now = options.now?.() ?? new Date()
  if (Number.isNaN(now.getTime()))
    return runResultCreateError(
      "runDelegationExecute",
      "The delegation clock is invalid.",
      runErrorCodes.delegationClockInvalid,
    )
  return createResult(now)
}

function runDelegationAbortFailureCreate(kind: RunDelegationAbortKind): RunFailureMetadata {
  return kind === "deadline"
    ? runDelegationFailureCreate("child_deadline_exceeded", "The delegated child run reached its immutable deadline.")
    : runDelegationFailureCreate("child_aborted", "The delegated child run was cancelled.")
}

function runDelegationFinalizationShouldRetry(result: Result<unknown>): boolean {
  if (result.success) return false
  const code = result.code
  return code === undefined || delegationFinalizationRetryableCodes.has(code)
}

async function runDelegationFinalizationRun(
  delegationId: string,
  result: RunDelegationResult,
  options: RunDelegationExecuteOptions,
): Promise<Result<unknown>> {
  const finalized = await options.delegationFinalize(delegationId, result)
  if (!runDelegationFinalizationShouldRetry(finalized)) return finalized
  return options.delegationFinalize(delegationId, result)
}

function runDelegationAbortKindResolve(
  controller: AbortController,
  deadlineAt: Date,
  deadlineTriggered: boolean,
  options: RunDelegationExecuteOptions,
): Result<RunDelegationAbortKind | null> {
  const now = runDelegationNowResolve(options)
  if (!now.success) return now
  if (now.data.getTime() >= deadlineAt.getTime()) {
    controller.abort()
    return createResult("deadline")
  }
  if (!controller.signal.aborted) return createResult(null)
  return createResult(deadlineTriggered ? "deadline" : "cancelled")
}

async function runDelegationIteratorNext<T>(
  iterator: AsyncIterator<T>,
  signal: AbortSignal,
): Promise<{ aborted: boolean; result?: IteratorResult<T> }> {
  let removeAbortListener: () => void = () => undefined
  const abort = new Promise<{ aborted: boolean }>((resolve) => {
    if (signal.aborted) {
      resolve({ aborted: true })
      return
    }
    const onAbort = () => resolve({ aborted: true })
    removeAbortListener = () => signal.removeEventListener("abort", onAbort)
    signal.addEventListener("abort", onAbort, { once: true })
  })
  const next = Promise.resolve(iterator.next()).then(
    (result) => ({ aborted: false, result }),
    () => ({ aborted: false, result: undefined }),
  )
  const result = await Promise.race([next, abort])
  removeAbortListener()
  return result
}

async function runDelegationAttemptExecute(
  options: RunDelegationExecuteOptions,
  run: typeof runTable.$inferSelect,
  attempt: typeof attemptTable.$inferSelect,
  task: string,
  controller: AbortController,
  deadlineTriggered: () => boolean,
  providerOutput: RunDelegationProviderOutput | undefined,
): Promise<Result<RunDelegationAttemptOutcome>> {
  const op = "runDelegationExecute"
  let text = ""
  let executionEvidence: RunRetryExecutionEvidence = "none"
  let outcome: RunDelegationAttemptOutcome | undefined

  const append = async (event: ExecutionStreamEvent): Promise<boolean> => {
    const persistedEvent: ExecutionStreamEvent =
      event.eventType === "terminal"
        ? {
            eventType: "terminal",
            payload: {
              ...(event.payload.code === undefined ? {} : { code: event.payload.code }),
              ...(event.payload.message === undefined ? {} : { message: event.payload.message }),
              status: event.payload.status,
            },
          }
        : event
    if (providerOutput !== undefined) {
      const persisted = await providerOutput.append(persistedEvent)
      if (!persisted.success) return false
    }
    if (persistedEvent.eventType === "text_delta") {
      const remaining = PRIVATE_RESULT_LIMIT - text.length
      if (remaining > 0) text += persistedEvent.payload.delta.slice(0, remaining)
    }
    if (persistedEvent.eventType === "tool_result") executionEvidence = "tool_result"
    return true
  }

  const terminalAppend = async (status: "aborted" | "error", failure: RunFailureMetadata): Promise<boolean> => {
    const terminal: ExecutionStreamEvent = {
      eventType: "terminal",
      payload: {
        code: failure.code,
        message: failure.message,
        status,
      },
    }
    return append(terminal)
  }

  try {
    let stream: AsyncIterable<ExecutionStreamEvent> | undefined
    try {
      stream = await options.attemptStreamCreate({ attempt, run, signal: controller.signal, task })
    } catch (error) {
      const failure = runDelegationFailureCreate(
        "provider_failed",
        error instanceof Error ? error.message : "The delegated child attempt failed.",
      )
      if (!(await terminalAppend("error", failure)))
        return runResultCreateError(op, failure.message, runErrorCodes.providerOutputPersistFailed)
      outcome = { executionEvidence, failure, status: "failed", text }
    }

    if (outcome === undefined && stream !== undefined) {
      const iterator = stream[Symbol.asyncIterator]()
      while (true) {
        const aborted = runDelegationAbortKindResolve(controller, run.deadlineAt, deadlineTriggered(), options)
        if (!aborted.success) return aborted
        if (aborted.data !== null) {
          const failure = runDelegationAbortFailureCreate(aborted.data)
          if (!(await terminalAppend("aborted", failure)))
            return runResultCreateError(op, failure.message, runErrorCodes.providerOutputPersistFailed)
          outcome = { executionEvidence, failure, status: "aborted", text }
          break
        }

        const next = await runDelegationIteratorNext(iterator, controller.signal)
        if (next.aborted) {
          const kind = runDelegationAbortKindResolve(controller, run.deadlineAt, deadlineTriggered(), options)
          if (!kind.success) return kind
          const abortKind = kind.data ?? "cancelled"
          const failure = runDelegationAbortFailureCreate(abortKind)
          if (!(await terminalAppend("aborted", failure)))
            return runResultCreateError(op, failure.message, runErrorCodes.providerOutputPersistFailed)
          outcome = { executionEvidence, failure, status: "aborted", text }
          break
        }
        if (next.result === undefined || next.result.done) break

        const parsedEvent = v.safeParse(executionStreamEventSchema, next.result.value)
        if (!parsedEvent.success) {
          const failure = runDelegationFailureCreate(
            "child_event_invalid",
            "The child attempt emitted an invalid event.",
          )
          if (!(await terminalAppend("error", failure)))
            return runResultCreateError(op, failure.message, runErrorCodes.providerOutputPersistFailed)
          outcome = { executionEvidence, failure, status: "failed", text }
          break
        }
        if (!(await append(parsedEvent.output)))
          return runResultCreateError(
            op,
            "The child event could not be persisted.",
            runErrorCodes.providerOutputPersistFailed,
          )

        if (parsedEvent.output.eventType !== "terminal") continue
        const terminal = parsedEvent.output.payload
        if (terminal.status === "completed") {
          outcome = { executionEvidence, status: "succeeded", text, failure: undefined }
        } else if (terminal.status === "aborted") {
          outcome = {
            executionEvidence,
            failure: runDelegationFailureCreate(
              terminal.code ?? "child_aborted",
              terminal.message ?? "The child run was aborted.",
            ),
            status: "aborted",
            text,
          }
        } else {
          outcome = {
            executionEvidence,
            failure: runDelegationFailureCreate(
              terminal.code ?? "provider_failed",
              terminal.message ?? "The child run failed.",
            ),
            status: "failed",
            text,
          }
        }
        break
      }
    }

    if (outcome !== undefined) return createResult(outcome)
    const aborted = runDelegationAbortKindResolve(controller, run.deadlineAt, deadlineTriggered(), options)
    if (!aborted.success) return aborted
    if (aborted.data !== null) {
      const failure = runDelegationAbortFailureCreate(aborted.data)
      if (!(await terminalAppend("aborted", failure)))
        return runResultCreateError(op, failure.message, runErrorCodes.providerOutputPersistFailed)
      return createResult({ executionEvidence, failure, status: "aborted", text })
    }

    const failure = runDelegationFailureCreate(
      "provider_failed",
      "The delegated child attempt ended before completion.",
    )
    if (!(await terminalAppend("error", failure)))
      return runResultCreateError(op, failure.message, runErrorCodes.providerOutputPersistFailed)
    return createResult({ executionEvidence, failure, status: "failed", text })
  } catch (_error) {
    return runResultCreateError(
      op,
      "The delegated child attempt could not be executed.",
      runErrorCodes.attemptExecutionFailed,
    )
  }
}

async function runDelegationReusedChildResolve(
  input: RunChildCreateInput,
  child: RunDelegationChild,
  options: RunDelegationExecuteOptions,
): Promise<Result<RunDelegationChild>> {
  const op = "runDelegationExecute"
  let current = child
  while (current.delegation.finalizedResult === null) {
    if (current.run.status !== "accepted" && current.run.status !== "running") {
      if (current.run.status !== "failed") {
        await new Promise<void>((resolve) => {
          const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout
          setTimeoutFn(resolve, REUSED_RESULT_POLL_INTERVAL_MS)
        })
        const observed = await options.childCreate(input)
        if (!observed.success) return observed
        current = observed.data
        continue
      }
      const failure = current.attempt.failure ?? current.run.failure
      if (failure === null) {
        await new Promise<void>((resolve) => {
          const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout
          setTimeoutFn(resolve, REUSED_RESULT_POLL_INTERVAL_MS)
        })
        const observed = await options.childCreate(input)
        if (!observed.success) return observed
        current = observed.data
        continue
      }
      const retryAdmission = runRetryAdmissionResolve({
        attemptOrdinal: current.attempt.ordinal,
        attemptStatus: current.attempt.status,
        budget: current.run.budget,
        executionEvidence: "unknown",
        failure,
      })
      if (!retryAdmission.success || retryAdmission.data.decision !== "retry") {
        await new Promise<void>((resolve) => {
          const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout
          setTimeoutFn(resolve, REUSED_RESULT_POLL_INTERVAL_MS)
        })
        const observed = await options.childCreate(input)
        if (!observed.success) return observed
        current = observed.data
        continue
      }
    }
    const now = runDelegationNowResolve(options)
    if (!now.success) return now
    if (now.data.getTime() >= current.run.deadlineAt.getTime()) {
      const observed = await options.childCreate(input)
      if (!observed.success) return observed
      current = observed.data
      if (current.delegation.finalizedResult !== null) break
      return runResultCreateError(
        op,
        "The reused delegated child did not finalize before its immutable deadline.",
        runErrorCodes.terminalResultMissing,
      )
    }
    await new Promise<void>((resolve) => {
      const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout
      setTimeoutFn(resolve, REUSED_RESULT_POLL_INTERVAL_MS)
    })
    const observed = await options.childCreate(input)
    if (!observed.success) return observed
    current = observed.data
  }
  return createResult(current)
}

export async function runDelegationExecute(
  input: RunDelegationExecuteInput,
  options: RunDelegationExecuteOptions,
): Promise<Result<RunDelegationResult>> {
  const op = "runDelegationExecute"
  const parsedInput = v.safeParse(runChildCreateInputSchema, {
    delegationKey: input.delegationKey,
    parentAttemptId: input.parentAttempt.id,
    parentRunId: input.parentRun.id,
    ...(input.childSnapshot === undefined ? {} : { snapshot: input.childSnapshot }),
    task: input.task,
  })
  if (!parsedInput.success)
    return runResultCreateError(op, "The delegated child input is invalid.", runErrorCodes.invalidInput)
  if (
    input.parentAttempt.runId !== input.parentRun.id ||
    input.parentAttempt.sessionId !== input.parentRun.sessionId ||
    input.parentAttempt.userId !== input.parentRun.userId
  ) {
    return runResultCreateError(
      op,
      "The trusted parent run and attempt are inconsistent.",
      runErrorCodes.stateInconsistent,
    )
  }
  if (input.parentRun.status !== "running" || input.parentAttempt.status !== "running") {
    return runResultCreateError(op, "The trusted parent attempt is not running.", runErrorCodes.stateInconsistent)
  }

  const childSnapshotPolicy = runDelegationChildSnapshotPolicyValidate(input.parentRun, parsedInput.output.snapshot)
  if (!childSnapshotPolicy.success) return childSnapshotPolicy

  const child = await options.childCreate(parsedInput.output)
  if (!child.success) return child
  if (child.data.delegation.finalizedResult !== null) {
    return runDelegationFinalizedResultResolve(child.data.delegation)
  }
  if (child.data.created && !runDelegationParentAdmissionActive(input)) {
    return runDelegationChildAdmissionAbortFinalize(child.data, options)
  }
  if (child.data.run.deadlineAt.getTime() !== input.parentRun.deadlineAt.getTime()) {
    return runResultCreateError(
      op,
      "The child run deadline is not inherited from the parent.",
      runErrorCodes.deadlineNotInherited,
    )
  }
  if (!child.data.created) {
    const reused = await runDelegationReusedChildResolve(parsedInput.output, child.data, options)
    if (!reused.success) return reused
    return runDelegationFinalizedResultResolve(reused.data.delegation)
  }
  if (child.data.run.status !== "accepted" || child.data.attempt.status !== "accepted") {
    return runResultCreateError(
      op,
      "The delegated child attempt is not accepted for execution.",
      runErrorCodes.attemptNotAccepted,
    )
  }

  const controller = new AbortController()
  let deadlineTriggered = false
  const unregister = options.cancellationRegister({
    controller,
    runId: child.data.run.id,
    sessionId: input.parentRun.sessionId,
    userId: input.parentRun.userId,
  })
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  const now = runDelegationNowResolve(options)
  if (!now.success) {
    unregister()
    return now
  }
  const deadlineDelay = child.data.run.deadlineAt.getTime() - now.data.getTime()
  if (deadlineDelay <= 0) {
    deadlineTriggered = true
    controller.abort()
  } else {
    const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout
    deadlineTimer = setTimeoutFn(() => {
      deadlineTriggered = true
      controller.abort()
    }, deadlineDelay) as ReturnType<typeof setTimeout>
  }

  let currentRun = child.data.run
  let currentAttempt = child.data.attempt
  const providerOutput = options.providerOutputCreate({
    requestId: input.delegationKey,
    runId: child.data.run.id,
    sessionId: input.parentRun.sessionId,
  })

  const providerOutputFinalize = async (input: {
    failure?: RunFailureMetadata
    reason?: string
    status: "aborted" | "failed" | "succeeded"
  }): Promise<Result<void>> => {
    if (providerOutput === undefined) return createResult(undefined)
    const finalized = await providerOutput.finalize(input)
    if (!finalized.success) return finalized
    return createResult(undefined)
  }

  try {
    while (true) {
      const abortKind = runDelegationAbortKindResolve(controller, currentRun.deadlineAt, deadlineTriggered, options)
      if (!abortKind.success) return abortKind
      if (abortKind.data !== null) {
        const failure = runDelegationAbortFailureCreate(abortKind.data)
        const outputFinalized = await providerOutputFinalize({ failure, status: "aborted" })
        if (!outputFinalized.success) return outputFinalized
        const finalized = await runDelegationFinalizationRun(
          child.data.delegation.id,
          {
            failure,
            status: "aborted",
            text: "",
          },
          options,
        )
        if (!finalized.success) return finalized
        return createResult({ failure, status: "aborted", text: "" })
      }

      const running = await providerOutput.start()
      if (!running.success) return running
      if (running.data.run !== undefined) currentRun = running.data.run
      if (running.data.attempt !== undefined) currentAttempt = running.data.attempt

      const attempt = await runDelegationAttemptExecute(
        options,
        currentRun,
        currentAttempt,
        parsedInput.output.task,
        controller,
        () => deadlineTriggered,
        providerOutput,
      )
      if (!attempt.success) return attempt

      const postAttemptAbort = runDelegationAbortKindResolve(
        controller,
        currentRun.deadlineAt,
        deadlineTriggered,
        options,
      )
      if (!postAttemptAbort.success) return postAttemptAbort
      if (postAttemptAbort.data !== null && attempt.data.status !== "aborted") {
        const failure = runDelegationAbortFailureCreate(postAttemptAbort.data)
        const outputFinalized = await providerOutputFinalize({ failure, status: "aborted" })
        if (!outputFinalized.success) return outputFinalized
        const finalized = await runDelegationFinalizationRun(
          child.data.delegation.id,
          {
            failure,
            status: "aborted",
            text: attempt.data.text,
          },
          options,
        )
        if (!finalized.success) return finalized
        return createResult({ failure, status: "aborted", text: attempt.data.text })
      }

      if (attempt.data.status === "aborted") {
        const failure = attempt.data.failure ?? runDelegationAbortFailureCreate("cancelled")
        const outputFinalized = await providerOutputFinalize({ failure, status: "aborted" })
        if (!outputFinalized.success) return outputFinalized
        const finalized = await runDelegationFinalizationRun(
          child.data.delegation.id,
          {
            failure,
            status: "aborted",
            text: attempt.data.text,
          },
          options,
        )
        if (!finalized.success) return finalized
        return createResult({
          failure,
          status: "aborted",
          text: attempt.data.text,
        })
      }
      if (attempt.data.status === "succeeded") {
        const outputFinalized = await providerOutputFinalize({ status: "succeeded" })
        if (!outputFinalized.success) return outputFinalized
        const succeeded = runDelegationResultCreate("succeeded", attempt.data.text)
        if (!succeeded.success) return succeeded
        const finalized = await runDelegationFinalizationRun(child.data.delegation.id, succeeded.data, options)
        if (!finalized.success) return finalized
        return succeeded
      }

      const failure = attempt.data.failure ?? runDelegationFailureCreate("provider_failed", "The child run failed.")
      const retryAdmission = runRetryAdmissionResolve({
        attemptOrdinal: currentAttempt.ordinal,
        attemptStatus: "failed",
        budget: currentRun.budget,
        executionEvidence: attempt.data.executionEvidence,
        failure,
      })
      if (!retryAdmission.success) return retryAdmission
      if (retryAdmission.data.decision !== "retry") {
        const outputFinalized = await providerOutputFinalize({ failure, status: "failed" })
        if (!outputFinalized.success) return outputFinalized
        const failed = runDelegationResultCreate("failed", attempt.data.text, failure)
        if (!failed.success) return failed
        const finalized = await runDelegationFinalizationRun(child.data.delegation.id, failed.data, options)
        if (!finalized.success) return finalized
        return failed
      }

      const transitioned = await options.runTransition(currentRun.id, { failure, status: "failed" })
      if (!transitioned.success) return transitioned
      if (transitioned.data.run !== undefined) currentRun = transitioned.data.run
      if (transitioned.data.attempt !== undefined) currentAttempt = transitioned.data.attempt
      const retry = await options.retryAttemptCreate(currentRun.id, {
        executionEvidence: attempt.data.executionEvidence,
        now: options.now ?? (() => new Date()),
      })
      if (!retry.success) {
        const outputFinalized = await providerOutputFinalize({ failure, status: "failed" })
        if (!outputFinalized.success) return outputFinalized
        const failed = runDelegationResultCreate("failed", attempt.data.text, failure)
        if (!failed.success) return failed
        const finalized = await runDelegationFinalizationRun(child.data.delegation.id, failed.data, options)
        if (!finalized.success) return finalized
        return failed
      }
      if (retry.data.attempt.status !== "accepted" || retry.data.run.status !== "accepted") {
        return runResultCreateError(
          op,
          "The next delegated child attempt is not accepted for execution.",
          runErrorCodes.attemptNotAccepted,
        )
      }
      currentAttempt = retry.data.attempt
      currentRun = retry.data.run
    }
  } finally {
    if (deadlineTimer !== undefined) (options.clearTimeout ?? globalThis.clearTimeout)(deadlineTimer)
    unregister()
  }
}
