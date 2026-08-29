import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient, DatabaseTransaction } from "../../database/databaseClient.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { journalWriteCreate } from "../../journal/actions/journalWriteCreate.js"

type SessionJournalMutationRunInput<T> = {
  database: DatabaseClient
  mutate: (transaction: DatabaseTransaction) => Promise<Result<T>>
  postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  resourceIdsResolve?: (transaction: DatabaseTransaction) => Promise<Result<readonly string[]>>
  resourceId: string
  resourceType?: "session" | "session-list"
  resolveRecipients: JournalEventRecipientResolver
  revisionResolve: (value: T, resourceId: string) => number | undefined
  replayResolve: (value: T) => boolean
}

export function sessionJournalMutationRun<T>(input: SessionJournalMutationRunInput<T>): Promise<Result<T>> {
  const writer = journalWriteCreate({
    database: input.database,
    postCommitPublish: input.postCommitPublish,
    resolveRecipients: input.resolveRecipients,
  })
  let mutation: T | undefined
  let resourceIds: readonly string[] | undefined
  const resourceType = input.resourceType ?? "session"
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
      return createResult(resourceIds.map((resourceId) => ({ resourceId, resourceType })))
    },
    write: async (_transaction, journal) => {
      if (mutation === undefined)
        return createResultError("sessionJournalMutationRun", "The session mutation result is missing.")
      if (input.replayResolve(mutation)) return createResult(undefined)
      if (resourceIds === undefined)
        return createResultError("sessionJournalMutationRun", "The session journal resources are missing.")
      for (const resourceId of resourceIds) {
        const revision = input.revisionResolve(mutation, resourceId)
        if (revision === undefined)
          return createResultError("sessionJournalMutationRun", "The session revision is missing.")
        const appended = await journal.append({
          eventType: "invalidate",
          payload: { resourceId, resourceType, revision },
          resource: { resourceId, resourceType },
        })
        if (!appended.success) return createResultError("sessionJournalMutationRun", appended.errorMessage)
      }
      return createResult(undefined)
    },
  })
}
