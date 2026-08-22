import { createResult, createResultError } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseClient, DatabaseTransaction } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionRepositoryDelete } from "../db/sessionRepositoryDelete.js"
import { sessionTable } from "../db/sessionTable.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"

export function sessionDelete(
  database: DatabaseClient,
  userId: string,
  sessionId: string,
  options?: Parameters<typeof sessionRepositoryDelete>[3] & {
    journal?: {
      postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
      resolveRecipients: JournalEventRecipientResolver
    }
  },
): ReturnType<typeof sessionRepositoryDelete> {
  const mutation = (transaction: Parameters<typeof sessionRepositoryDelete>[0]) =>
    sessionRepositoryDelete(transaction, userId, sessionId, options)
  if (options?.journal !== undefined)
    return sessionJournalMutationRun({
      database,
      mutate: mutation,
      postCommitPublish: options.journal.postCommitPublish,
      resourceId: sessionId,
      resolveRecipients: options.journal.resolveRecipients,
      resourceIdsResolve: async (transaction: DatabaseTransaction) => {
        if (options.organizationId === undefined)
          return createResultError("sessionDelete", "The session organization is required.")
        try {
          const children = await transaction
            .select({ id: sessionTable.id })
            .from(sessionTable)
            .innerJoin(
              serverTable,
              and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, options.organizationId)),
            )
            .where(and(eq(sessionTable.parentSessionId, sessionId), eq(sessionTable.userId, userId)))
          return createResult(children.map(({ id }) => id))
        } catch (_error) {
          return createResultError("sessionDelete", "The child sessions could not be resolved.")
        }
      },
      replayResolve: (value) => value.replayed,
      revisionResolve: (value, resourceId) => {
        if (resourceId !== sessionId) return value.affectedSessions.find(({ id }) => id === resourceId)?.revision
        const revision = value.responseBody?.session.revision
        return revision === undefined ? undefined : revision + 1
      },
    })
  return databaseExecutorTransactionRun(database, mutation)
}
