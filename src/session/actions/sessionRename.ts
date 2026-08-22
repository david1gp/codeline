import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { sessionRepositoryRename } from "../db/sessionRepositoryRename.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"

export function sessionRename(
  database: DatabaseClient,
  userId: string,
  sessionId: string,
  title: string,
  options?: {
    expectedEtag?: string
    idempotencyKey?: string
    organizationId?: string
    requireIfMatch?: boolean
    requestHash?: string
    journal?: {
      postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
      resolveRecipients: JournalEventRecipientResolver
    }
  },
): ReturnType<typeof sessionRepositoryRename> {
  const mutation = (transaction: Parameters<typeof sessionRepositoryRename>[0]) =>
    sessionRepositoryRename(transaction, userId, sessionId, title, options)
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
