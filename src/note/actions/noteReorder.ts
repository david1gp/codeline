import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { noteRepositoryLoad } from "../db/noteRepositoryLoad.js"
import type { NoteRepositoryMutationResult } from "../db/noteRepositoryMutationResult.js"
import { noteRepositoryReorder } from "../db/noteRepositoryReorder.js"
import { noteReorderRequestSchema } from "../schema/noteReorderRequestSchema.js"
import { noteJournalMutationRun } from "./noteJournalMutationRun.js"
import { noteJournalResourceIdsRead } from "./noteJournalResourceIdsRead.js"
import { noteProjectPathResolve } from "./noteProjectPathResolve.js"

type NoteReorderActionOptions = {
  expectedEtag?: string
  journal?: {
    postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    resolveRecipients: JournalEventRecipientResolver
  }
  organizationId?: string
  projectRootDirs?: readonly string[]
  requestHash?: string
  requireIfMatch?: boolean
}

export async function noteReorder(
  database: DatabaseClient,
  userId: string,
  noteId: string,
  input: unknown,
  options: NoteReorderActionOptions = {},
): Promise<Result<NoteRepositoryMutationResult>> {
  const parsed = v.safeParse(noteReorderRequestSchema, input)
  if (!parsed.success) return createResultError("noteReorder", "The note reorder input is invalid.")
  let historicalProjectPath: string | null | undefined
  if (parsed.output.projectId !== null) {
    const existing = await noteRepositoryLoad(database, userId, noteId, options.organizationId)
    if (!existing.success) return createResultError("noteReorder", existing.errorMessage)
    if (existing.data === undefined) return createResultError("noteReorder", "The note could not be found.")
    historicalProjectPath = existing.data.projectPath
  }
  const projectPath = await noteProjectPathResolve(database, userId, parsed.output.projectId, {
    historicalProjectPath,
    projectRootDirs: options.projectRootDirs,
  })
  if (!projectPath.success) return createResultError("noteReorder", projectPath.errorMessage)
  const { projectId: _projectId, ...request } = parsed.output
  const mutation = (transaction: Parameters<typeof noteRepositoryReorder>[0]) =>
    noteRepositoryReorder(transaction, userId, noteId, {
      ...request,
      expectedEtag: options.expectedEtag,
      organizationId: options.organizationId,
      projectPath: projectPath.data,
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
