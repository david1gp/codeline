import { createResult, type Result } from "@adaptive-ds/result"
import { and, desc, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { runRetryAdmissionResolve } from "../actions/runRetryAdmissionResolve.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runExecutionSnapshotSchema } from "../schema/runExecutionSnapshotSchema.js"
import type { RunRetryAdmission } from "../schema/runRetryAdmissionSchema.js"
import type { RunRetryExecutionEvidence } from "../schema/runRetryExecutionEvidenceSchema.js"
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
  attemptCreate?: (
    transaction: DatabaseExecutor,
    input: typeof attemptTable.$inferInsert,
  ) => Promise<Result<typeof attemptTable.$inferSelect>>
  executionEvidence?: RunRetryExecutionEvidence
  now?: () => Date
  runReopen?: (
    transaction: DatabaseExecutor,
    input: { now: Date; runId: string },
  ) => Promise<Result<typeof runTable.$inferSelect>>
}

async function runRetryAttemptPersist(
  transaction: DatabaseExecutor,
  input: typeof attemptTable.$inferInsert,
): Promise<Result<typeof attemptTable.$inferSelect>> {
  const op = "runRepositoryRetryAttemptCreate"
  try {
    const [attempt] = await transaction.insert(attemptTable).values(input).returning()
    if (attempt === undefined)
      return runResultCreateError(
        op,
        "The next run attempt could not be created.",
        runErrorCodes.retryAttemptPersistenceFailed,
      )
    return createResult(attempt)
  } catch (_error) {
    return runResultCreateError(
      op,
      "The next run attempt could not be created.",
      runErrorCodes.retryAttemptPersistenceFailed,
    )
  }
}

async function runRetryRunReopen(
  transaction: DatabaseExecutor,
  input: { now: Date; runId: string },
): Promise<Result<typeof runTable.$inferSelect>> {
  const op = "runRepositoryRetryAttemptCreate"
  try {
    const [run] = await transaction
      .update(runTable)
      .set({
        failure: null,
        finishedAt: null,
        startedAt: null,
        status: "accepted",
        updatedAt: input.now,
      })
      .where(and(eq(runTable.id, input.runId), eq(runTable.status, "failed")))
      .returning()
    if (run === undefined)
      return runResultCreateError(op, "The run could not be reopened for retry.", runErrorCodes.retryReopenFailed)
    return createResult(run)
  } catch (_error) {
    return runResultCreateError(op, "The run could not be reopened for retry.", runErrorCodes.retryReopenFailed)
  }
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
      if (session === undefined)
        return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)

      const [run] = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .limit(1)
      if (run === undefined) return runResultCreateError(op, "The run could not be found.", runErrorCodes.notFound)

      const [latestAttempt] = await transaction
        .select()
        .from(attemptTable)
        .where(
          and(eq(attemptTable.runId, run.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
        )
        .orderBy(desc(attemptTable.ordinal))
        .limit(1)
      if (latestAttempt === undefined)
        return runResultCreateError(op, "The latest run attempt could not be loaded.", runErrorCodes.attemptNotFound)
      if (latestAttempt.sessionId !== sessionId || latestAttempt.userId !== userId) {
        return runResultCreateError(op, "The run attempt ownership is inconsistent.", runErrorCodes.stateInconsistent)
      }
      const parsedRunSnapshot = v.safeParse(runExecutionSnapshotSchema, run.snapshot)
      const parsedAttemptSnapshot = v.safeParse(runExecutionSnapshotSchema, latestAttempt.snapshot)
      if (!parsedRunSnapshot.success || !parsedAttemptSnapshot.success) {
        return runResultCreateError(
          op,
          "The run and latest attempt snapshots are invalid.",
          runErrorCodes.retryAttemptInconsistent,
        )
      }
      if (jsonCanonicalize(parsedRunSnapshot.output) !== jsonCanonicalize(parsedAttemptSnapshot.output)) {
        return runResultCreateError(
          op,
          "The run and latest attempt snapshots are inconsistent.",
          runErrorCodes.retryAttemptInconsistent,
        )
      }
      if (
        run.status !== latestAttempt.status ||
        jsonCanonicalize(run.failure) !== jsonCanonicalize(latestAttempt.failure)
      ) {
        return runResultCreateError(
          op,
          "The run and latest attempt statuses are inconsistent.",
          runErrorCodes.stateInconsistent,
        )
      }

      if (run.cancellationRequestedAt !== null) {
        return runResultCreateError(op, "The run retry was not admitted: cancelled.", runErrorCodes.retryNotAdmitted)
      }

      if (run.status === "accepted" && latestAttempt.ordinal > 1) {
        if (
          jsonCanonicalize(run.snapshot) !== jsonCanonicalize(latestAttempt.snapshot) ||
          jsonCanonicalize(run.budget) !== jsonCanonicalize(latestAttempt.budget) ||
          latestAttempt.streamId !== runRetryAttemptStreamIdCreate(run.id, latestAttempt.ordinal)
        ) {
          return runResultCreateError(
            op,
            "The existing retry attempt is inconsistent with the run.",
            runErrorCodes.retryAttemptInconsistent,
          )
        }
        return createResult({ admission: null, attempt: latestAttempt, created: false, run })
      }

      if (latestAttempt.status !== "failed" || latestAttempt.failure === null) {
        return runResultCreateError(op, "The run retry was not admitted.", runErrorCodes.retryNotAdmitted)
      }
      const admission = runRetryAdmissionResolve({
        attemptOrdinal: latestAttempt.ordinal,
        attemptStatus: latestAttempt.status,
        budget: run.budget,
        ...(options.executionEvidence === undefined ? {} : { executionEvidence: options.executionEvidence }),
        failure: latestAttempt.failure,
      })
      if (!admission.success) return admission
      if (admission.data.decision !== "retry" || admission.data.nextAttemptOrdinal === null) {
        return runResultCreateError(
          op,
          `The run retry was not admitted: ${admission.data.reason}.`,
          runErrorCodes.retryNotAdmitted,
        )
      }

      const now = options.now?.() ?? new Date()
      if (Number.isNaN(now.getTime()))
        return runResultCreateError(op, "The retry clock is invalid.", runErrorCodes.clockInvalid)
      if (now.getTime() >= run.deadlineAt.getTime()) {
        return runResultCreateError(
          op,
          "The run retry was not admitted: deadline_exceeded.",
          runErrorCodes.retryNotAdmitted,
        )
      }

      const nextAttemptOrdinal = admission.data.nextAttemptOrdinal
      const attemptCreated = await (options.attemptCreate ?? runRetryAttemptPersist)(transaction, {
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
      if (!attemptCreated.success) return attemptCreated

      const runReopened = await (options.runReopen ?? runRetryRunReopen)(transaction, { now, runId: run.id })
      if (!runReopened.success) return runReopened

      return createResult({
        admission: admission.data,
        attempt: attemptCreated.data,
        created: true,
        run: runReopened.data,
      })
    } catch (_error) {
      return runResultCreateError(
        op,
        "The next run attempt could not be persisted.",
        runErrorCodes.retryAttemptPersistenceFailed,
      )
    }
  })
}
