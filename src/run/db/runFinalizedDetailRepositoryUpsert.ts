import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runToolDetailSchema } from "../api/runToolDetailSchema.js"
import { runTranscriptSchema } from "../api/runTranscriptSchema.js"
import { runFinalizedDetailTable } from "./runFinalizedDetailTable.js"

const runFinalizedDetailRepositoryUpsertInputSchema = v.strictObject({
  tools: v.pipe(v.array(runToolDetailSchema), v.maxLength(1_000)),
  transcript: runTranscriptSchema,
})

function runFinalizedDetailCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(runFinalizedDetailCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${runFinalizedDetailCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

export async function runFinalizedDetailRepositoryUpsert(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  input: unknown,
): Promise<Result<void>> {
  const op = "runFinalizedDetailRepositoryUpsert"
  const parsedInput = v.safeParse(runFinalizedDetailRepositoryUpsertInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The finalized run detail is invalid.")

  try {
    const [existing] = await database
      .select()
      .from(runFinalizedDetailTable)
      .where(
        and(
          eq(runFinalizedDetailTable.runId, runId),
          eq(runFinalizedDetailTable.sessionId, sessionId),
          eq(runFinalizedDetailTable.userId, userId),
        ),
      )
      .limit(1)
    if (existing !== undefined) {
      if (
        runFinalizedDetailCanonicalize(existing.transcript) !==
          runFinalizedDetailCanonicalize(parsedInput.output.transcript) ||
        runFinalizedDetailCanonicalize(existing.tools) !== runFinalizedDetailCanonicalize(parsedInput.output.tools)
      )
        return createResultError(op, "The finalized run detail conflicts with the existing detail.")
      return createResult(undefined)
    }

    const [created] = await database
      .insert(runFinalizedDetailTable)
      .values({
        runId,
        sessionId,
        tools: parsedInput.output.tools,
        transcript: parsedInput.output.transcript,
        userId,
      })
      .returning({ runId: runFinalizedDetailTable.runId })
    if (created === undefined) return createResultError(op, "The finalized run detail could not be saved.")
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The finalized run detail could not be saved.")
  }
}
