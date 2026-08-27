import { createResult, type Result } from "@adaptive-ds/result"
import { and, desc, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunTransitionInput, runTransitionInputSchema } from "../schema/runTransitionInputSchema.js"
import { attemptTable } from "./attemptTable.js"
import { runTable } from "./runTable.js"

const terminalStatuses = new Set(["succeeded", "failed", "aborted"])

function statusTransitionIsLegal(current: string, next: string): boolean {
  if (current === next) return true
  if (current === "accepted") return next === "running" || next === "aborted"
  if (current === "running") return terminalStatuses.has(next)
  return false
}

function jsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

function failureMatches(left: unknown, right: unknown): boolean {
  return jsonCanonicalize(left) === jsonCanonicalize(right)
}

type RunTransitionResult = {
  changed: boolean
  run: typeof runTable.$inferSelect
  attempt: typeof attemptTable.$inferSelect
}

export async function runRepositoryTransition(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  input: RunTransitionInput,
): Promise<Result<RunTransitionResult>> {
  const op = "runRepositoryTransition"
  const parsedInput = v.safeParse(runTransitionInputSchema, input)
  if (!parsedInput.success)
    return runResultCreateError(op, "The run transition input is invalid.", runErrorCodes.invalidInput)
  const nextFailure = parsedInput.output.failure ?? null
  if (parsedInput.output.status !== "failed" && parsedInput.output.status !== "aborted" && nextFailure !== null) {
    return runResultCreateError(
      op,
      "Failure metadata is only valid for failed or aborted runs.",
      runErrorCodes.failureMetadataInvalid,
    )
  }
  if (parsedInput.output.status === "failed" && nextFailure === null) {
    return runResultCreateError(op, "Failed runs require failure metadata.", runErrorCodes.failureMetadataRequired)
  }

  return databaseExecutorTransactionRun<RunTransitionResult>(database, async (transaction) => {
    try {
      const [session] = await transaction
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined)
        return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)

      const [run] = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .limit(1)
      if (run === undefined) return runResultCreateError(op, "The run could not be found.", runErrorCodes.notFound)

      const [attempt] = await transaction
        .select()
        .from(attemptTable)
        .where(
          and(eq(attemptTable.runId, run.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
        )
        .orderBy(desc(attemptTable.ordinal))
        .limit(1)
      if (attempt === undefined)
        return runResultCreateError(op, "The run attempt could not be found.", runErrorCodes.attemptNotFound)
      if (attempt.sessionId !== sessionId || attempt.userId !== userId) {
        return runResultCreateError(op, "The run attempt ownership is inconsistent.", runErrorCodes.stateInconsistent)
      }
      if (run.status !== attempt.status || !failureMatches(run.failure, attempt.failure)) {
        return runResultCreateError(
          op,
          "The run and attempt statuses are inconsistent.",
          runErrorCodes.stateInconsistent,
        )
      }
      if (!statusTransitionIsLegal(run.status, parsedInput.output.status)) {
        return runResultCreateError(op, "The run status transition is not allowed.", runErrorCodes.transitionInvalid)
      }
      if (run.status === parsedInput.output.status) {
        if (!failureMatches(run.failure, nextFailure)) {
          return runResultCreateError(
            op,
            "The terminal run failure metadata cannot be overwritten.",
            runErrorCodes.failureMetadataImmutable,
          )
        }
        return createResult<RunTransitionResult>({ changed: false, run, attempt })
      }
      if (run.cancellationRequestedAt !== null && parsedInput.output.status !== "aborted") {
        return runResultCreateError(op, "The cancelled run cannot be transitioned.", runErrorCodes.transitionInvalid)
      }

      const now = new Date()
      const timing = parsedInput.output.status === "running" ? { startedAt: now } : {}
      const terminalTiming = terminalStatuses.has(parsedInput.output.status) ? { finishedAt: now } : {}
      const runUpdate = await transaction
        .update(runTable)
        .set({
          ...timing,
          ...terminalTiming,
          failure: nextFailure,
          status: parsedInput.output.status,
          updatedAt: now,
        })
        .where(eq(runTable.id, run.id))
        .returning()
      const [updatedRun] = runUpdate
      if (updatedRun === undefined)
        return runResultCreateError(op, "The run could not be transitioned.", runErrorCodes.transitionFailed)

      const attemptUpdate = await transaction
        .update(attemptTable)
        .set({
          ...timing,
          ...terminalTiming,
          failure: nextFailure,
          status: parsedInput.output.status,
          updatedAt: now,
        })
        .where(and(eq(attemptTable.id, attempt.id), eq(attemptTable.status, run.status)))
        .returning()
      const [updatedAttempt] = attemptUpdate
      if (updatedAttempt === undefined)
        return runResultCreateError(
          op,
          "The run attempt could not be transitioned.",
          runErrorCodes.attemptPersistenceFailed,
        )
      return createResult<RunTransitionResult>({ changed: true, run: updatedRun, attempt: updatedAttempt })
    } catch (_error) {
      return runResultCreateError(op, "The run transition could not be persisted.", runErrorCodes.persistFailed)
    }
  })
}
