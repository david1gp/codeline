import { createResultError } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionRepositoryCreate } from "../db/sessionRepositoryCreate.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"

export async function sessionCreate(
  database: DatabaseClient,
  userId: string,
  input: Omit<Parameters<typeof sessionRepositoryCreate>[3], "projectPath" | "pinned"> & { projectPath?: string },
  options: {
    idempotencyKey?: string
    journal?: {
      postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
      resolveRecipients: JournalEventRecipientResolver
    }
    organizationId: string
    projectRootDirs?: readonly string[]
    requestHash?: string
  },
): ReturnType<typeof sessionRepositoryCreate> {
  const projectPath = await projectPathReferenceResolve(input.projectPath, options.projectRootDirs ?? [])
  if (!projectPath.success) return createResultError("sessionCreate", projectPath.errorMessage)
  const sessionId = uuidv7()
  const mutation = (transaction: Parameters<typeof sessionRepositoryCreate>[0]) =>
    sessionRepositoryCreate(transaction, userId, options.organizationId, {
      ...input,
      id: sessionId,
      idempotencyKey: options.idempotencyKey,
      pinned: true,
      projectPath: projectPath.data,
      requestHash: options.requestHash,
    })
  if (options.journal !== undefined)
    return sessionJournalMutationRun({
      database,
      mutate: mutation,
      postCommitPublish: options.journal.postCommitPublish,
      resourceId: sessionId,
      resolveRecipients: options.journal.resolveRecipients,
      replayResolve: (value) => value.replayed || !value.created,
      revisionResolve: (value) => value.session.revision,
    })
  return databaseExecutorTransactionRun(database, mutation)
}
