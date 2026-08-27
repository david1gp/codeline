import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq, inArray } from "drizzle-orm"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import type { DatabaseClient, DatabaseTransaction } from "../../database/databaseClient.js"
import { journalEventTable } from "../db/journalEventTable.js"
import type { JournalEventRecipientResolver } from "./journalEventRecipientResolver.js"
import type { journalEventsAppendPersist } from "./journalEventsAppendPersist.js"
import { journalRunDeltasDelete } from "./journalRunDeltasDelete.js"
import { journalSequenceLocksAcquire } from "./journalSequenceLocksAcquire.js"
import { journalWriteCreate } from "./journalWriteCreate.js"

const journalRunFailureSchema = v.strictObject({
  code: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  message: v.pipe(v.string(), v.maxLength(4_096)),
})

const journalRunTerminalEventSchema = v.variant("eventType", [
  v.strictObject({
    eventType: v.literal("run-completed"),
    payload: v.strictObject({
      messageId: v.nullable(apiPublicIdSchema),
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
    }),
  }),
  v.strictObject({
    eventType: v.literal("run-failed"),
    payload: v.strictObject({
      failure: v.nullable(journalRunFailureSchema),
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
    }),
  }),
  v.strictObject({
    eventType: v.literal("run-cancelled"),
    payload: v.strictObject({
      reason: v.optional(v.pipe(v.string(), v.maxLength(200))),
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
    }),
  }),
  v.strictObject({
    eventType: v.literal("run-interrupted"),
    payload: v.strictObject({
      reason: v.pipe(v.string(), v.maxLength(200)),
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
    }),
  }),
])

const journalRunFinalizeInputSchema = v.strictObject({
  runId: apiPublicIdSchema,
  terminalEvent: journalRunTerminalEventSchema,
})

type JournalRunFinalizeInput = v.InferOutput<typeof journalRunFinalizeInputSchema>
type JournalRunFinalizeOperation<T> = (transaction: DatabaseTransaction) => Promise<Result<T>>
type JournalEvent = typeof journalEventTable.$inferSelect

type JournalRunFinalizeDependencies = {
  appendPersist?: typeof journalEventsAppendPersist
  database: DatabaseClient
  runDeltasDelete?: typeof journalRunDeltasDelete
  postCommitPublish: (events: readonly JournalEvent[]) => Result<void> | Promise<Result<void>>
  resolveRecipients: JournalEventRecipientResolver
}

const journalTerminalEventTypes = ["run-completed", "run-failed", "run-cancelled", "run-interrupted"] as const

async function journalRunPriorDeltaRecipients(
  transaction: DatabaseTransaction,
  runId: string,
): Promise<Result<string[]>> {
  const op = "journalRunFinalize"
  try {
    const rows = await transaction
      .select({ userId: journalEventTable.userId })
      .from(journalEventTable)
      .where(and(eq(journalEventTable.eventType, "delta"), eq(journalEventTable.runId, runId)))
    return createResult([...new Set(rows.map((row) => row.userId))])
  } catch (_error) {
    return createResultError(op, "The prior journal delta recipients could not be resolved.")
  }
}

async function journalRunDuplicateCheck(transaction: DatabaseTransaction, runId: string): Promise<Result<void>> {
  const op = "journalRunFinalize"
  try {
    const [terminal] = await transaction
      .select({ id: journalEventTable.id })
      .from(journalEventTable)
      .where(and(inArray(journalEventTable.eventType, journalTerminalEventTypes), eq(journalEventTable.runId, runId)))
      .limit(1)
    if (terminal !== undefined) {
      const result = createResultErrorCode(
        op,
        "The journal run has already been finalized.",
        "journal_run_already_finalized",
      )
      result.statusCode = 409
      return result
    }
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The journal run finalization state could not be checked.")
  }
}

export function journalRunFinalize(dependencies: JournalRunFinalizeDependencies) {
  const writer = journalWriteCreate(dependencies)
  const runDeltasDelete = dependencies.runDeltasDelete ?? journalRunDeltasDelete

  const finalize = async <T>(
    input: JournalRunFinalizeInput,
    operation: JournalRunFinalizeOperation<T>,
  ): Promise<Result<T>> => {
    const op = "journalRunFinalize"
    const parsedInput = v.safeParse(journalRunFinalizeInputSchema, input)
    if (!parsedInput.success) return createResultError(op, "The journal run finalization input is invalid.")
    if (parsedInput.output.terminalEvent.payload.runId !== parsedInput.output.runId)
      return createResultError(op, "The terminal event run ID does not match the finalized run.")

    let priorRecipientIds: string[] = []
    const result = await writer.run<T>({
      additionalRecipientIds: async (transaction) => {
        const prior = await journalRunPriorDeltaRecipients(transaction, parsedInput.output.runId)
        if (prior.success) priorRecipientIds = prior.data
        return prior
      },
      beforeMutation: async (transaction) => {
        const latestPriorRecipients = await journalRunPriorDeltaRecipients(transaction, parsedInput.output.runId)
        if (!latestPriorRecipients.success) return latestPriorRecipients
        priorRecipientIds = latestPriorRecipients.data
        if (priorRecipientIds.length > 0) {
          const priorLocked = await journalSequenceLocksAcquire(transaction, priorRecipientIds)
          if (!priorLocked.success) return createResultError(op, priorLocked.errorMessage)
        }
        return journalRunDuplicateCheck(transaction, parsedInput.output.runId)
      },
      mutate: operation,
      resources: [{ resourceId: parsedInput.output.runId, resourceType: "run" }],
      write: async (transaction, journal) => {
        if (priorRecipientIds.length > 0) {
          const deleted = await runDeltasDelete(transaction, parsedInput.output.runId, priorRecipientIds)
          if (!deleted.success) return createResultError(op, deleted.errorMessage)
        }

        const appended = await journal.append({
          eventType: parsedInput.output.terminalEvent.eventType,
          payload: parsedInput.output.terminalEvent.payload,
          resource: { resourceId: parsedInput.output.runId, resourceType: "run" },
        })
        if (!appended.success) return createResultError(op, appended.errorMessage)
        return createResult(undefined)
      },
    })
    return result
  }

  return { finalize }
}
