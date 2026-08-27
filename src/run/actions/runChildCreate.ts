import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseClient, DatabaseExecutor } from "../../database/databaseClient.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { journalWriteCreate } from "../../journal/actions/journalWriteCreate.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { runRepositoryChildCreate } from "../db/runRepositoryChildCreate.js"

type RunChildCreateResult = Awaited<ReturnType<typeof runRepositoryChildCreate>> extends Result<infer T> ? T : never

type RunChildCreateJournal = {
  postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  resolveRecipients: JournalEventRecipientResolver
}

/**
 * Creating a child run inserts a delegation and bumps the session revision, but the
 * session's cached delegation list only refreshes when the feed observes a session
 * invalidation. Without this event the parent's `delegate_task` stream entry can never
 * be linked to its child run, so the subagent thread affordance never appears.
 */
export function runChildCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: Parameters<typeof runRepositoryChildCreate>[3],
  journal?: RunChildCreateJournal,
): Promise<Result<RunChildCreateResult>> {
  if (journal === undefined) return runRepositoryChildCreate(database, userId, sessionId, input)

  const writer = journalWriteCreate({
    database: database as DatabaseClient,
    postCommitPublish: journal.postCommitPublish,
    resolveRecipients: journal.resolveRecipients,
  })
  let mutation: RunChildCreateResult | undefined

  return writer.run<RunChildCreateResult>({
    mutate: async (transaction) => {
      const result = await runRepositoryChildCreate(transaction, userId, sessionId, input)
      if (result.success) mutation = result.data
      return result
    },
    resources: [{ resourceId: sessionId, resourceType: "session" }],
    write: async (transaction, journalTransaction) => {
      if (mutation === undefined) return createResultError("runChildCreate", "The child run result is missing.")
      // An idempotent replay changed nothing, so no invalidation is owed.
      if (!mutation.created) return createResult(undefined)
      const [session] = await transaction
        .select({ revision: sessionTable.revision })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError("runChildCreate", "The session revision is missing.")
      const appended = await journalTransaction.append({
        eventType: "invalidate",
        payload: { resourceId: sessionId, resourceType: "session", revision: session.revision },
        resource: { resourceId: sessionId, resourceType: "session" },
      })
      if (!appended.success) return createResultError("runChildCreate", appended.errorMessage)
      return createResult(undefined)
    },
  })
}
