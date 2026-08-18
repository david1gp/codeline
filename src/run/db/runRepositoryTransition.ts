import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient, DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { runTransitionInputSchema, type RunTransitionInput } from "../schema/runTransitionInputSchema.js"
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
  if (!parsedInput.success) return createResultError(op, "The run transition input is invalid.")
  const nextFailure = parsedInput.output.failure ?? null
  if (parsedInput.output.status !== "failed" && parsedInput.output.status !== "aborted" && nextFailure !== null) {
    return createResultError(op, "Failure metadata is only valid for failed or aborted runs.")
  }
  if (parsedInput.output.status === "failed" && nextFailure === null) {
    return createResultError(op, "Failed runs require failure metadata.")
  }

  return databaseTransactionRun<RunTransitionResult>(database as DatabaseClient, async (transaction) => {
    try {
      const [session] = await transaction
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .for("update")
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")

      const [run] = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .for("update")
        .limit(1)
      if (run === undefined) return createResultError(op, "The run could not be found.")

      const [attempt] = await transaction
        .select()
        .from(attemptTable)
        .where(
          and(eq(attemptTable.runId, run.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
        )
        .orderBy(desc(attemptTable.ordinal))
        .for("update")
        .limit(1)
      if (attempt === undefined) return createResultError(op, "The run attempt could not be found.")
      if (attempt.sessionId !== sessionId || attempt.userId !== userId) {
        return createResultError(op, "The run attempt ownership is inconsistent.")
      }
      if (run.status !== attempt.status || !failureMatches(run.failure, attempt.failure)) {
        return createResultError(op, "The run and attempt statuses are inconsistent.")
      }
      if (!statusTransitionIsLegal(run.status, parsedInput.output.status)) {
        return createResultError(op, "The run status transition is not allowed.")
      }
      if (run.status === parsedInput.output.status) {
        if (!failureMatches(run.failure, nextFailure)) {
          return createResultError(op, "The terminal run failure metadata cannot be overwritten.")
        }
        return createResult<RunTransitionResult>({ changed: false, run, attempt })
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
      if (updatedRun === undefined) return createResultError(op, "The run could not be transitioned.")

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
      if (updatedAttempt === undefined) return createResultError(op, "The run attempt could not be transitioned.")
      return createResult<RunTransitionResult>({ changed: true, run: updatedRun, attempt: updatedAttempt })
    } catch (_error) {
      return createResultError(op, "The run transition could not be persisted.")
    }
  })
}
