import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { runRetryAdmissionResolve } from "../actions/runRetryAdmissionResolve.js"
import type { RunRetryAdmission } from "../schema/runRetryAdmissionSchema.js"
import { attemptTable } from "./attemptTable.js"
import { runTable } from "./runTable.js"

function jsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

function runRetryAttemptStreamIdCreate(runId: string, ordinal: number): string {
  return `run-attempt:${runId}:${ordinal}`
}

type RunRetryAttemptCreateResult = {
  admission: RunRetryAdmission | null
  attempt: typeof attemptTable.$inferSelect
  created: boolean
  run: typeof runTable.$inferSelect
}

type RunRetryAttemptCreateOptions = {
  now?: () => Date
}

export async function runRepositoryRetryAttemptCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  options: RunRetryAttemptCreateOptions = {},
): Promise<Result<RunRetryAttemptCreateResult>> {
  const op = "runRepositoryRetryAttemptCreate"

  return databaseExecutorTransactionRun<RunRetryAttemptCreateResult>(database, async (transaction) => {
    try {
      const [session] = await transaction
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")

      const [run] = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .limit(1)
      if (run === undefined) return createResultError(op, "The run could not be found.")

      const [latestAttempt] = await transaction
        .select()
        .from(attemptTable)
        .where(
          and(eq(attemptTable.runId, run.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
        )
        .orderBy(desc(attemptTable.ordinal))
        .limit(1)
      if (latestAttempt === undefined) return createResultError(op, "The latest run attempt could not be loaded.")
      if (latestAttempt.sessionId !== sessionId || latestAttempt.userId !== userId) {
        return createResultError(op, "The run attempt ownership is inconsistent.")
      }
      if (
        run.status !== latestAttempt.status ||
        jsonCanonicalize(run.failure) !== jsonCanonicalize(latestAttempt.failure)
      ) {
        return createResultError(op, "The run and latest attempt statuses are inconsistent.")
      }

      if (run.status === "accepted" && latestAttempt.ordinal > 1) {
        if (
          jsonCanonicalize(run.snapshot) !== jsonCanonicalize(latestAttempt.snapshot) ||
          jsonCanonicalize(run.budget) !== jsonCanonicalize(latestAttempt.budget) ||
          latestAttempt.streamId !== runRetryAttemptStreamIdCreate(run.id, latestAttempt.ordinal)
        ) {
          return createResultError(op, "The existing retry attempt is inconsistent with the run.")
        }
        return createResult({ admission: null, attempt: latestAttempt, created: false, run })
      }

      if (latestAttempt.status !== "failed" || latestAttempt.failure === null) {
        return createResultError(op, "The run retry was not admitted.")
      }
      const admission = runRetryAdmissionResolve({
        attemptOrdinal: latestAttempt.ordinal,
        attemptStatus: latestAttempt.status,
        budget: run.budget,
        failure: latestAttempt.failure,
      })
      if (!admission.success) return createResultError(op, admission.errorMessage)
      if (admission.data.decision !== "retry" || admission.data.nextAttemptOrdinal === null) {
        return createResultError(op, `The run retry was not admitted: ${admission.data.reason}.`)
      }

      if (run.cancellationRequestedAt !== null) {
        return createResultError(op, "The run retry was not admitted: cancelled.")
      }
      const now = options.now?.() ?? new Date()
      if (Number.isNaN(now.getTime())) return createResultError(op, "The retry clock is invalid.")
      if (now.getTime() >= run.deadlineAt.getTime()) {
        return createResultError(op, "The run retry was not admitted: deadline_exceeded.")
      }

      const nextAttemptOrdinal = admission.data.nextAttemptOrdinal
      const [attempt] = await transaction
        .insert(attemptTable)
        .values({
          budget: run.budget,
          failure: null,
          id: uuidv7(),
          ordinal: nextAttemptOrdinal,
          runId: run.id,
          sessionId,
          snapshot: run.snapshot,
          streamId: runRetryAttemptStreamIdCreate(run.id, nextAttemptOrdinal),
          userId,
        })
        .returning()
      if (attempt === undefined) return createResultError(op, "The next run attempt could not be created.")

      const [updatedRun] = await transaction
        .update(runTable)
        .set({
          failure: null,
          finishedAt: null,
          startedAt: null,
          status: "accepted",
          updatedAt: now,
        })
        .where(and(eq(runTable.id, run.id), eq(runTable.status, "failed")))
        .returning()
      if (updatedRun === undefined) return createResultError(op, "The run could not be reopened for retry.")

      return createResult({ admission: admission.data, attempt, created: true, run: updatedRun })
    } catch (_error) {
      return createResultError(op, "The next run attempt could not be persisted.")
    }
  })
}
