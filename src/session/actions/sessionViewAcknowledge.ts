import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { sessionViewRepositoryAcknowledge } from "../db/sessionViewRepositoryAcknowledge.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"

export function sessionViewAcknowledge(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  options: {
    journal: {
      postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
      resolveRecipients: JournalEventRecipientResolver
    }
  },
): ReturnType<typeof sessionViewRepositoryAcknowledge> {
  const mutation = (transaction: Parameters<typeof sessionViewRepositoryAcknowledge>[0]) =>
    sessionViewRepositoryAcknowledge(transaction, userId, organizationId, sessionId)
  return sessionJournalMutationRun({
    database,
    mutate: mutation,
    postCommitPublish: options.journal.postCommitPublish,
    replayResolve: (value) => !value.changed,
    resourceId: userId,
    resourceType: "session-list",
    resolveRecipients: options.journal.resolveRecipients,
    revisionResolve: (value) => value.acknowledgedFinishedAt?.getTime(),
  })
}
