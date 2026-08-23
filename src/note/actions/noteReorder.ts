import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import type { NoteRepositoryMutationResult } from "../db/noteRepositoryMutationResult.js"
import { noteRepositoryReorder } from "../db/noteRepositoryReorder.js"
import { noteReorderRequestSchema } from "../schema/noteReorderRequestSchema.js"
import { noteJournalMutationRun } from "./noteJournalMutationRun.js"
import { noteJournalResourceIdsRead } from "./noteJournalResourceIdsRead.js"

type NoteReorderActionOptions = {
  expectedEtag?: string
  journal?: {
    postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    resolveRecipients: JournalEventRecipientResolver
  }
  organizationId?: string
  requestHash?: string
  requireIfMatch?: boolean
}

export function noteReorder(
  database: DatabaseClient,
  userId: string,
  noteId: string,
  input: unknown,
  options: NoteReorderActionOptions = {},
): Promise<Result<NoteRepositoryMutationResult>> {
  const parsed = v.safeParse(noteReorderRequestSchema, input)
  if (!parsed.success) return Promise.resolve(createResultError("noteReorder", "The note reorder input is invalid."))
  const mutation = (transaction: Parameters<typeof noteRepositoryReorder>[0]) =>
    noteRepositoryReorder(transaction, userId, noteId, {
      ...parsed.output,
      expectedEtag: options.expectedEtag,
      organizationId: options.organizationId,
      requestHash: options.requestHash,
      requireIfMatch: options.requireIfMatch,
    })
  if (options.journal !== undefined)
    return noteJournalMutationRun({
      database,
      mutate: mutation,
      postCommitPublish: options.journal.postCommitPublish,
      resourceId: noteId,
      resourceIdsResolve: (transaction) => noteJournalResourceIdsRead(transaction, userId),
      resolveRecipients: options.journal.resolveRecipients,
    })
  return databaseExecutorTransactionRun(database, mutation)
}
