import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient, DatabaseTransaction } from "../../database/databaseClient.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { journalWriteCreate } from "../../journal/actions/journalWriteCreate.js"
import type { NoteRepositoryMutationResult } from "../db/noteRepositoryMutationResult.js"

type NoteJournalMutationRunInput<T extends NoteRepositoryMutationResult> = {
  database: DatabaseClient
  mutate: (transaction: DatabaseTransaction) => Promise<Result<T>>
  postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  resourceId: string
  resourceIdsResolve?: (transaction: DatabaseTransaction) => Promise<Result<readonly string[]>>
  resolveRecipients: JournalEventRecipientResolver
}

export function noteJournalMutationRun<T extends NoteRepositoryMutationResult>(
  input: NoteJournalMutationRunInput<T>,
): Promise<Result<T>> {
  const writer = journalWriteCreate({
    database: input.database,
    postCommitPublish: input.postCommitPublish,
    resolveRecipients: input.resolveRecipients,
  })
  let mutation: T | undefined
  let resourceIds: readonly string[] | undefined
  return writer.run({
    mutate: async (transaction) => {
      const result = await input.mutate(transaction)
      if (result.success) mutation = result.data
      return result
    },
    resources: async (transaction) => {
      const resolved =
        input.resourceIdsResolve === undefined
          ? createResult<readonly string[]>([input.resourceId])
          : await input.resourceIdsResolve(transaction)
      if (!resolved.success) return resolved
      resourceIds = [...new Set([input.resourceId, ...resolved.data])]
      return createResult(resourceIds.map((resourceId) => ({ resourceId, resourceType: "note" as const })))
    },
    write: async (_transaction, journal) => {
      if (mutation === undefined)
        return createResultError("noteJournalMutationRun", "The note mutation result is missing.")
      if (mutation.replayed) return createResult(undefined)
      if (resourceIds === undefined)
        return createResultError("noteJournalMutationRun", "The note journal resources are missing.")
      const preparedIds = new Set(resourceIds)
      for (const affected of mutation.affectedNotes) {
        if (!preparedIds.has(affected.id))
          return createResultError("noteJournalMutationRun", "The note journal resource is missing.")
        const appended = await journal.append({
          eventType: "invalidate",
          payload: { resourceId: affected.id, resourceType: "note", revision: affected.revision },
          resource: { resourceId: affected.id, resourceType: "note" },
        })
        if (!appended.success) return createResultError("noteJournalMutationRun", appended.errorMessage)
      }
      return createResult(undefined)
    },
  })
}
