import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { sessionRepositoryPin } from "../db/sessionRepositoryPin.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"

export function sessionPin(
  database: DatabaseClient,
  userId: string,
  sessionId: string,
  pinned: boolean,
  options?: Parameters<typeof sessionRepositoryPin>[4] & {
    journal?: {
      postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
      resolveRecipients: JournalEventRecipientResolver
    }
  },
): ReturnType<typeof sessionRepositoryPin> {
  const mutation = (transaction: Parameters<typeof sessionRepositoryPin>[0]) =>
    sessionRepositoryPin(transaction, userId, sessionId, pinned, options)
  if (options?.journal !== undefined)
    return sessionJournalMutationRun({
      database,
      mutate: mutation,
      postCommitPublish: options.journal.postCommitPublish,
      resourceId: sessionId,
      resolveRecipients: options.journal.resolveRecipients,
      replayResolve: (value) => value.replayed,
      revisionResolve: (value) => value.responseBody?.revision,
    })
  return databaseExecutorTransactionRun(database, mutation)
}
