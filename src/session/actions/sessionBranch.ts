import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionRepositoryBranch } from "../db/sessionRepositoryBranch.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"

export function sessionBranch(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sourceSessionId: string,
  input: Parameters<typeof sessionRepositoryBranch>[4] & {
    journal?: {
      postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
      resolveRecipients: JournalEventRecipientResolver
    }
    requestHash?: string
  },
): ReturnType<typeof sessionRepositoryBranch> {
  const targetSessionId = uuidv7()
  const mutation = (transaction: Parameters<typeof sessionRepositoryBranch>[0]) =>
    sessionRepositoryBranch(transaction, userId, organizationId, sourceSessionId, {
      ...input,
      id: targetSessionId,
      idempotencyKey: input.requestHash === undefined ? undefined : input.clientRequestId,
      requestHash: input.requestHash,
    })
  if (input.journal !== undefined)
    return sessionJournalMutationRun({
      database,
      mutate: mutation,
      postCommitPublish: input.journal.postCommitPublish,
      resourceId: targetSessionId,
      resolveRecipients: input.journal.resolveRecipients,
      replayResolve: (value) => value.replayed || !value.created,
      revisionResolve: (value) => value.session.revision,
    })
  return databaseExecutorTransactionRun(database, mutation)
}
