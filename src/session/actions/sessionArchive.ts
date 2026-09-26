import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { sessionRepositoryArchive } from "../db/sessionRepositoryArchive.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"

export function sessionArchive(
  database: DatabaseClient,
  userId: string,
  sessionId: string,
  options?: Parameters<typeof sessionRepositoryArchive>[3] & {
    journal?: {
      postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
      resolveRecipients: JournalEventRecipientResolver
    }
  },
): ReturnType<typeof sessionRepositoryArchive> {
  const mutation = (transaction: Parameters<typeof sessionRepositoryArchive>[0]) =>
    sessionRepositoryArchive(transaction, userId, sessionId, options)
  if (options?.journal !== undefined)
    return sessionJournalMutationRun({
      database,
      mutate: mutation,
      postCommitPublish: options.journal.postCommitPublish,
      resourceId: sessionId,
      resolveRecipients: options.journal.resolveRecipients,
      replayResolve: (value) => value.replayed || !value.changed,
      revisionResolve: (value) => value.responseBody?.revision,
    })
  return databaseExecutorTransactionRun(database, mutation)
}
