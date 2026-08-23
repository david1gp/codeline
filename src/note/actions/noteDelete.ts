import type { Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { noteRepositoryDelete } from "../db/noteRepositoryDelete.js"
import type { NoteRepositoryMutationResult } from "../db/noteRepositoryMutationResult.js"
import { noteJournalMutationRun } from "./noteJournalMutationRun.js"
import { noteJournalResourceIdsRead } from "./noteJournalResourceIdsRead.js"

type NoteDeleteActionOptions = Parameters<typeof noteRepositoryDelete>[3] & {
  journal?: {
    postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    resolveRecipients: JournalEventRecipientResolver
  }
}

export function noteDelete(
  database: DatabaseClient,
  userId: string,
  noteId: string,
  options: NoteDeleteActionOptions = {},
): Promise<Result<NoteRepositoryMutationResult>> {
  const { journal, ...repositoryOptions } = options
  const mutation = (transaction: Parameters<typeof noteRepositoryDelete>[0]) =>
    noteRepositoryDelete(transaction, userId, noteId, repositoryOptions)
  if (journal !== undefined)
    return noteJournalMutationRun({
      database,
      mutate: mutation,
      postCommitPublish: journal.postCommitPublish,
      resourceId: noteId,
      resourceIdsResolve: (transaction) => noteJournalResourceIdsRead(transaction, userId),
      resolveRecipients: journal.resolveRecipients,
    })
  return databaseExecutorTransactionRun(database, mutation)
}
