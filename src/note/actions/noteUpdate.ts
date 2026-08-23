import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import type { NoteRepositoryMutationResult } from "../db/noteRepositoryMutationResult.js"
import { noteRepositoryUpdate } from "../db/noteRepositoryUpdate.js"
import { noteUpdateRequestSchema } from "../schema/noteUpdateRequestSchema.js"
import { noteJournalMutationRun } from "./noteJournalMutationRun.js"
import { noteJournalResourceIdsRead } from "./noteJournalResourceIdsRead.js"

type NoteUpdateActionOptions = {
  expectedEtag?: string
  journal?: {
    postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    resolveRecipients: JournalEventRecipientResolver
  }
  organizationId?: string
  requestHash?: string
  requireIfMatch?: boolean
}

export function noteUpdate(
  database: DatabaseClient,
  userId: string,
  noteId: string,
  input: unknown,
  options: NoteUpdateActionOptions = {},
): Promise<Result<NoteRepositoryMutationResult>> {
  const parsed = v.safeParse(noteUpdateRequestSchema, input)
  if (!parsed.success) return Promise.resolve(createResultError("noteUpdate", "The note update input is invalid."))
  const mutation = (transaction: Parameters<typeof noteRepositoryUpdate>[0]) =>
    noteRepositoryUpdate(transaction, userId, noteId, {
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
