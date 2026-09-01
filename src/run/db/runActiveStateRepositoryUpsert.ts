import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionHistoryEntryPositionAllocate } from "../../session/db/sessionHistoryEntryPositionAllocate.js"
import { runFailureMetadataSchema } from "../schema/runFailureMetadataSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"
import { runActiveStateTable } from "./runActiveStateTable.js"
import { runTable } from "./runTable.js"

const runActiveStateStatusSchema = v.picklist(["accepted", "running"])
const runActiveStateSequenceSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER))
const runActiveStateTextSchema = v.pipe(v.string(), v.maxLength(16_384))
const runActiveStateRepositoryUpsertInputSchema = v.strictObject({
  failure: v.optional(v.nullable(runFailureMetadataSchema)),
  lastSequence: v.optional(runActiveStateSequenceSchema),
  partialText: v.optional(runActiveStateTextSchema),
  status: runActiveStateStatusSchema,
})

type RunActiveStateRepositoryUpsertResult = {
  changed: boolean
  state: typeof runActiveStateTable.$inferSelect
}

function runActiveStateFailureCanonicalize(value: unknown): string {
  return JSON.stringify(value)
}

export async function runActiveStateRepositoryUpsert(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  input: unknown,
): Promise<Result<RunActiveStateRepositoryUpsertResult>> {
  const op = "runActiveStateRepositoryUpsert"
  const parsedInput = v.safeParse(runActiveStateRepositoryUpsertInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The active run state input is invalid.")

  try {
    const [run] = await database
      .select({ id: runTable.id, status: runTable.status })
      .from(runTable)
      .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
      .limit(1)
    if (run === undefined) return createResultError(op, "The run could not be found.")
    const runStatus = v.safeParse(runStatusSchema, run.status)
    if (!runStatus.success || (runStatus.output !== "accepted" && runStatus.output !== "running"))
      return createResultError(op, "The active run state belongs to a terminal run.")

    const [existing] = await database
      .select()
      .from(runActiveStateTable)
      .where(
        and(
          eq(runActiveStateTable.runId, runId),
          eq(runActiveStateTable.sessionId, sessionId),
          eq(runActiveStateTable.userId, userId),
        ),
      )
      .limit(1)

    const next = {
      failure: parsedInput.output.failure === undefined ? (existing?.failure ?? null) : parsedInput.output.failure,
      lastSequence: parsedInput.output.lastSequence ?? existing?.lastSequence ?? 0,
      partialText: parsedInput.output.partialText ?? existing?.partialText ?? "",
      status: parsedInput.output.status,
    }

    if (
      existing !== undefined &&
      existing.failure !== undefined &&
      existing.lastSequence === next.lastSequence &&
      existing.partialText === next.partialText &&
      existing.status === next.status &&
      runActiveStateFailureCanonicalize(existing.failure) === runActiveStateFailureCanonicalize(next.failure)
    )
      return createResult({ changed: false, state: existing })

    const position = await sessionHistoryEntryPositionAllocate(database, userId, sessionId)
    if (!position.success) return position
    const now = new Date()
    if (existing !== undefined) {
      const [state] = await database
        .update(runActiveStateTable)
        .set({ ...next, changePosition: position.data, updatedAt: now })
        .where(
          and(
            eq(runActiveStateTable.runId, runId),
            eq(runActiveStateTable.sessionId, sessionId),
            eq(runActiveStateTable.userId, userId),
          ),
        )
        .returning()
      if (state === undefined) return createResultError(op, "The active run state could not be updated.")
      return createResult({ changed: true, state })
    }

    const [state] = await database
      .insert(runActiveStateTable)
      .values({
        changePosition: position.data,
        createdAt: now,
        failure: next.failure,
        lastSequence: next.lastSequence,
        partialText: next.partialText,
        runId,
        sessionId,
        status: next.status,
        updatedAt: now,
        userId,
      })
      .returning()
    if (state === undefined) return createResultError(op, "The active run state could not be created.")
    return createResult({ changed: true, state })
  } catch (_error) {
    return createResultError(op, "The active run state could not be saved.")
  }
}
