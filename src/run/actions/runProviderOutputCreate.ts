import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseClient, DatabaseTransaction } from "../../database/databaseClient.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { journalRunFinalize } from "../../journal/actions/journalRunFinalize.js"
import { journalWriteCreate } from "../../journal/actions/journalWriteCreate.js"
import { messageAppend } from "../../message/actions/messageAppend.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { streamProducerCoalescerCreate } from "../../stream/actions/streamProducerCoalescerCreate.js"
import type { StreamProducerDelta } from "../../stream/schema/streamProducerDeltaSchema.js"
import { attemptTable } from "../db/attemptTable.js"
import { runTable } from "../db/runTable.js"
import { runTransition } from "./runTransition.js"

type RunProviderOutputScheduler = {
  clearTimeout: (handle: unknown) => void
  setTimeout: (handler: () => void, timeoutMs: number) => unknown
}

type RunProviderOutputCreateOptions = {
  database: DatabaseClient
  journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  runId: string
  scheduler: RunProviderOutputScheduler
  sessionId: string
  userId: string
}

type RunProviderOutputFinalizeInput = {
  assistantText?: string
  failure?: { code: string; message: string }
  messageId?: string | null
  reason?: string
  status: "aborted" | "failed" | "succeeded"
}

type RunProviderOutputFinalizeResult = {
  attempt: typeof attemptTable.$inferSelect
  run: typeof runTable.$inferSelect
}

function runProviderOutputRecipientResolve(userId: string) {
  return async (transaction: DatabaseTransaction, resource: { resourceId: string; resourceType: string }) => {
    const op = "runProviderOutputRecipientResolve"
    if (resource.resourceType !== "run") return createResultError(op, "The run journal resource is invalid.")
    try {
      const [run] = await transaction
        .select({ userId: runTable.userId })
        .from(runTable)
        .where(and(eq(runTable.id, resource.resourceId), eq(runTable.userId, userId)))
        .limit(1)
      if (run === undefined) return createResultError(op, "The run journal resource could not be authorized.")
      return createResult([run.userId])
    } catch (_error) {
      return createResultError(op, "The run journal recipient could not be resolved.")
    }
  }
}

function runProviderOutputMessageIdResolve(input: Record<string, unknown>): string | null {
  return typeof input.messageId === "string" ? input.messageId : null
}

function runProviderOutputDeltaResolve(
  input: unknown,
  runId: string,
  sessionId: string,
): Result<StreamProducerDelta | null> {
  if (input === null || typeof input !== "object") return createResult(null)
  const candidate = input as Record<string, unknown>

  if (typeof candidate.deltaKind === "string" && typeof candidate.runId === "string") {
    return createResult(input as StreamProducerDelta)
  }

  const type = candidate.type
  const delta = candidate.delta
  if (typeof delta !== "string") return createResult(null)

  const deltaKind =
    type === "TEXT_MESSAGE_CONTENT"
      ? "text"
      : type === "TOOL_CALL_ARGS"
        ? "tool"
        : type === "REASONING_MESSAGE_CONTENT" || type === "REASONING_MESSAGE_CHUNK"
          ? "thinking"
          : null
  if (deltaKind === null) return createResult(null)

  return createResult({
    delta,
    deltaKind,
    messageId: runProviderOutputMessageIdResolve(candidate),
    runId,
    sessionId,
  })
}

function runProviderOutputTerminalEventCreate(
  input: RunProviderOutputFinalizeInput,
  sessionRevision: number,
  runId: string,
  sessionId: string,
) {
  if (input.status === "succeeded") {
    return {
      eventType: "run-completed" as const,
      payload: {
        messageId: input.messageId ?? null,
        runId,
        sessionId,
        sessionRevision,
      },
    }
  }
  if (input.status === "failed") {
    return {
      eventType: "run-failed" as const,
      payload: {
        failure: input.failure ?? null,
        runId,
        sessionId,
        sessionRevision,
      },
    }
  }
  return {
    eventType: "run-cancelled" as const,
    payload: {
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      runId,
      sessionId,
      sessionRevision,
    },
  }
}

function runProviderOutputTransitionInputCreate(input: RunProviderOutputFinalizeInput) {
  if (input.status === "succeeded") return { status: "succeeded" as const }
  if (input.status === "failed") {
    return {
      failure: input.failure ?? { code: "provider_failed", message: "The provider failed." },
      status: "failed" as const,
    }
  }
  return { status: "aborted" as const }
}

async function runProviderOutputSessionRevisionLoad(
  database: DatabaseClient,
  userId: string,
  sessionId: string,
  assistantText: string | undefined,
): Promise<Result<number>> {
  const op = "runProviderOutput"
  try {
    const [session] = await database
      .select({ revision: sessionTable.revision })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined) return createResultError(op, "The session could not be found.")
    return createResult(session.revision + (assistantText === undefined ? 0 : 1))
  } catch (_error) {
    return createResultError(op, "The session revision could not be loaded.")
  }
}

export function runProviderOutputCreate(options: RunProviderOutputCreateOptions) {
  const resource = { resourceId: options.runId, resourceType: "run" as const }
  const resolveRecipients = runProviderOutputRecipientResolve(options.userId)
  const journalWriter = journalWriteCreate({
    database: options.database,
    postCommitPublish: options.journalPostCommitPublish,
    resolveRecipients,
  })
  let flushes = Promise.resolve<Result<void>>(createResult(undefined))

  const deltaPersist = async (event: StreamProducerDelta): Promise<Result<void>> => {
    const persisted = await journalWriter.run({
      resources: [resource],
      write: async (_transaction, journal) => {
        const appended = await journal.append({ eventType: "delta", payload: event, resource })
        if (!appended.success) return createResultError("runProviderOutput", appended.errorMessage)
        return createResult(undefined)
      },
    })
    if (!persisted.success) return createResultError("runProviderOutput", persisted.errorMessage)
    return createResult(undefined)
  }

  const coalescer = streamProducerCoalescerCreate({
    onFlush: (event) => {
      flushes = flushes.then(async (previous) => {
        if (!previous.success) return previous
        try {
          return await deltaPersist(event)
        } catch (_error) {
          return createResultError("runProviderOutput", "The provider delta could not be persisted.")
        }
      })
    },
    scheduler: options.scheduler,
  })

  const flushesAwait = async (): Promise<Result<void>> => flushes

  const append = async (input: unknown): Promise<Result<void>> => {
    const event = runProviderOutputDeltaResolve(input, options.runId, options.sessionId)
    if (!event.success) return event
    if (event.data === null) return createResult(undefined)
    if (event.data.runId !== options.runId || event.data.sessionId !== options.sessionId) {
      return createResultError("runProviderOutput", "The provider delta belongs to another run.")
    }
    const appended = coalescer.append(event.data)
    if (!appended.success) return appended
    return flushesAwait()
  }

  const flush = async (): Promise<Result<void>> => {
    const flushed = coalescer.flushAll()
    if (!flushed.success) return flushed
    return flushesAwait()
  }

  const finalize = async (input: RunProviderOutputFinalizeInput): Promise<Result<RunProviderOutputFinalizeResult>> => {
    const flushed = await flush()
    if (!flushed.success) return flushed
    const sessionRevision = await runProviderOutputSessionRevisionLoad(
      options.database,
      options.userId,
      options.sessionId,
      input.assistantText,
    )
    if (!sessionRevision.success) return sessionRevision
    const terminalEvent = runProviderOutputTerminalEventCreate(
      input,
      sessionRevision.data,
      options.runId,
      options.sessionId,
    )
    const finalizer = journalRunFinalize({
      database: options.database,
      postCommitPublish: options.journalPostCommitPublish,
      resolveRecipients,
    })
    const finalized = await finalizer.finalize({ runId: options.runId, terminalEvent }, async (transaction) => {
      if (input.status === "succeeded" && input.assistantText !== undefined) {
        const message = await messageAppend(transaction, options.userId, options.sessionId, {
          clientRequestId: `${options.runId}:assistant`,
          content: input.assistantText,
          role: "assistant",
        })
        if (!message.success) return createResultError("runProviderOutput", message.errorMessage)
      }
      const transitioned = await runTransition(
        transaction,
        options.userId,
        options.sessionId,
        options.runId,
        runProviderOutputTransitionInputCreate(input),
      )
      if (!transitioned.success) return createResultError("runProviderOutput", transitioned.errorMessage)
      return createResult({ run: transitioned.data.run, attempt: transitioned.data.attempt })
    })
    return finalized
  }

  return { append, finalize, flush, pendingCount: coalescer.pendingCount }
}
