import { createResult, type Result } from "@adaptive-ds/result"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import type { DatabaseClient, DatabaseTransaction } from "../../database/databaseClient.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { journalWriteCreate } from "../../journal/actions/journalWriteCreate.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { attemptTable } from "../db/attemptTable.js"
import { runTable } from "../db/runTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"

const activeRunStatuses = ["accepted", "running"] as const
const interruptionReason = "The API process stopped while the run was active."
const interruptionFailure = {
  code: "chat_interrupted",
  message: interruptionReason,
}

type RunStartupInterruptionRecord = {
  runId: string
  sessionId: string
  sessionRevision: number
}

type RunStartupInterruptionMutation = {
  runs: RunStartupInterruptionRecord[]
}

function runStartupInterruptionRecipientResolve(): JournalEventRecipientResolver {
  return async (transaction, resource) => {
    const op = "runStartupInterruptionRecipientResolve"
    if (resource.resourceType !== "run")
      return runResultCreateError(op, "The run journal resource is invalid.", runErrorCodes.journalResourceInvalid)

    try {
      const [run] = await transaction
        .select({ userId: runTable.userId })
        .from(runTable)
        .where(eq(runTable.id, resource.resourceId))
        .limit(1)
      if (run === undefined)
        return runResultCreateError(op, "The run journal resource could not be authorized.", runErrorCodes.notFound)
      return createResult([run.userId])
    } catch (_error) {
      return runResultCreateError(
        op,
        "The run journal recipient could not be resolved.",
        runErrorCodes.journalRecipientFailed,
      )
    }
  }
}

async function runStartupInterruptionActiveIds(database: DatabaseClient): Promise<Result<string[]>> {
  const op = "runStartupInterruptionReconcile"
  try {
    const runs = await database
      .select({ id: runTable.id })
      .from(runTable)
      .where(inArray(runTable.status, activeRunStatuses))
      .orderBy(asc(runTable.id))
    return createResult(runs.map((run) => run.id))
  } catch (_error) {
    return runResultCreateError(op, "The active runs could not be loaded.", runErrorCodes.persistFailed)
  }
}

async function runStartupInterruptionMutate(
  transaction: DatabaseTransaction,
  runIds: readonly string[],
): Promise<Result<RunStartupInterruptionMutation>> {
  const op = "runStartupInterruptionReconcile"
  try {
    const runs = await transaction
      .select()
      .from(runTable)
      .where(and(inArray(runTable.id, runIds), inArray(runTable.status, activeRunStatuses)))
      .orderBy(asc(runTable.id))
    if (runs.length === 0) return createResult({ runs: [] })

    const attempts = await transaction
      .select()
      .from(attemptTable)
      .where(
        inArray(
          attemptTable.runId,
          runs.map((run) => run.id),
        ),
      )
      .orderBy(asc(attemptTable.runId), desc(attemptTable.ordinal), asc(attemptTable.id))
    const latestAttemptByRunId = new Map<string, (typeof attempts)[number]>()
    for (const attempt of attempts) {
      if (!latestAttemptByRunId.has(attempt.runId)) latestAttemptByRunId.set(attempt.runId, attempt)
    }

    for (const run of runs) {
      const attempt = latestAttemptByRunId.get(run.id)
      if (attempt === undefined)
        return runResultCreateError(op, "The active run attempt could not be found.", runErrorCodes.attemptNotFound)
      if (attempt.status !== run.status || attempt.userId !== run.userId || attempt.sessionId !== run.sessionId) {
        return runResultCreateError(op, "The active run and attempt are inconsistent.", runErrorCodes.stateInconsistent)
      }
    }

    const now = new Date()
    const sessionIds = [...new Set(runs.map((run) => run.sessionId))].sort()
    const sessionRevisions = new Map<string, number>()
    for (const sessionId of sessionIds) {
      const [session] = await transaction
        .update(sessionTable)
        .set({ revision: sql`${sessionTable.revision} + 1`, updatedAt: now })
        .where(eq(sessionTable.id, sessionId))
        .returning({ id: sessionTable.id, revision: sessionTable.revision })
      if (session === undefined)
        return runResultCreateError(
          op,
          "The interrupted run session could not be updated.",
          runErrorCodes.sessionUpdateFailed,
        )
      sessionRevisions.set(session.id, session.revision)
    }

    const updatedRuns = await transaction
      .update(runTable)
      .set({
        failure: interruptionFailure,
        finishedAt: now,
        status: "aborted",
        updatedAt: now,
      })
      .where(
        and(
          inArray(
            runTable.id,
            runs.map((run) => run.id),
          ),
          inArray(runTable.status, activeRunStatuses),
        ),
      )
      .returning({ id: runTable.id })
    if (updatedRuns.length !== runs.length)
      return runResultCreateError(op, "The active runs could not be interrupted.", runErrorCodes.persistFailed)

    const updatedAttempts = await transaction
      .update(attemptTable)
      .set({
        failure: interruptionFailure,
        finishedAt: now,
        status: "aborted",
        updatedAt: now,
      })
      .where(
        and(
          inArray(
            attemptTable.id,
            runs.map((run) => latestAttemptByRunId.get(run.id)?.id ?? ""),
          ),
          inArray(attemptTable.status, activeRunStatuses),
        ),
      )
      .returning({ id: attemptTable.id })
    if (updatedAttempts.length !== runs.length)
      return runResultCreateError(op, "The active run attempts could not be interrupted.", runErrorCodes.persistFailed)

    return createResult({
      runs: runs.map((run) => ({
        runId: run.id,
        sessionId: run.sessionId,
        sessionRevision: sessionRevisions.get(run.sessionId) ?? 0,
      })),
    })
  } catch (_error) {
    return runResultCreateError(op, "The active runs could not be interrupted.", runErrorCodes.persistFailed)
  }
}

export async function runStartupInterruptionReconcile(input: {
  database: DatabaseClient
  postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
}): Promise<Result<{ interruptedRunIds: string[] }>> {
  const activeRunIds = await runStartupInterruptionActiveIds(input.database)
  if (!activeRunIds.success) return activeRunIds
  if (activeRunIds.data.length === 0) return createResult({ interruptedRunIds: [] })

  const writer = journalWriteCreate({
    database: input.database,
    postCommitPublish: input.postCommitPublish,
    resolveRecipients: runStartupInterruptionRecipientResolve(),
  })
  let mutation: RunStartupInterruptionMutation | undefined
  const reconciled = await writer.run({
    mutate: async (transaction) => {
      const result = await runStartupInterruptionMutate(transaction, activeRunIds.data)
      if (result.success) mutation = result.data
      return result
    },
    resources: activeRunIds.data.map((runId) => ({ resourceId: runId, resourceType: "run" as const })),
    write: async (_transaction, journal) => {
      const op = "runStartupInterruptionReconcile"
      if (mutation === undefined)
        return runResultCreateError(op, "The interruption mutation result is missing.", runErrorCodes.mutationMissing)
      for (const run of mutation.runs) {
        const appended = await journal.append({
          eventType: "run-interrupted",
          payload: {
            reason: interruptionReason,
            runId: run.runId,
            sessionId: run.sessionId,
            sessionRevision: run.sessionRevision,
          },
          resource: { resourceId: run.runId, resourceType: "run" },
        })
        if (!appended.success) return appended
      }
      return createResult(undefined)
    },
  })
  if (!reconciled.success) return reconciled
  return createResult({ interruptedRunIds: mutation?.runs.map((run) => run.runId) ?? [] })
}
