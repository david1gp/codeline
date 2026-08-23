import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { noteRepositoryCreate } from "../db/noteRepositoryCreate.js"
import type { NoteRepositoryMutationResult } from "../db/noteRepositoryMutationResult.js"
import { noteCreateRequestSchema } from "../schema/noteCreateRequestSchema.js"
import { noteJournalMutationRun } from "./noteJournalMutationRun.js"
import { noteJournalResourceIdsRead } from "./noteJournalResourceIdsRead.js"

type NoteCreateActionOptions = {
  journal?: {
    postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    resolveRecipients: JournalEventRecipientResolver
  }
  organizationId?: string
  requestHash?: string
}

export function noteCreate(
  database: DatabaseClient,
  userId: string,
  input: unknown,
  options: NoteCreateActionOptions = {},
): Promise<Result<NoteRepositoryMutationResult>> {
  const parsed = v.safeParse(noteCreateRequestSchema, input)
  if (!parsed.success) return Promise.resolve(createResultError("noteCreate", "The note creation input is invalid."))
  const mutation = (transaction: Parameters<typeof noteRepositoryCreate>[0]) =>
    noteRepositoryCreate(transaction, userId, {
      ...parsed.output,
      organizationId: options.organizationId,
      requestHash: options.requestHash,
    })
  if (options.journal !== undefined)
    return noteJournalMutationRun({
      database,
      mutate: mutation,
      postCommitPublish: options.journal.postCommitPublish,
      resourceId: parsed.output.id,
      resourceIdsResolve: (transaction) => noteJournalResourceIdsRead(transaction, userId),
      resolveRecipients: options.journal.resolveRecipients,
    })
  return databaseExecutorTransactionRun(database, mutation)
}
