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
import { noteProjectPathResolve } from "./noteProjectPathResolve.js"

type NoteCreateActionOptions = {
  journal?: {
    postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    resolveRecipients: JournalEventRecipientResolver
  }
  organizationId?: string
  projectRootDirs?: readonly string[]
  requestHash?: string
}

export async function noteCreate(
  database: DatabaseClient,
  userId: string,
  input: unknown,
  options: NoteCreateActionOptions = {},
): Promise<Result<NoteRepositoryMutationResult>> {
  const parsed = v.safeParse(noteCreateRequestSchema, input)
  if (!parsed.success) return createResultError("noteCreate", "The note creation input is invalid.")
  const projectPath = await noteProjectPathResolve(database, userId, parsed.output.projectId, {
    projectRootDirs: options.projectRootDirs,
  })
  if (!projectPath.success) return createResultError("noteCreate", projectPath.errorMessage)
  const { projectId: _projectId, ...request } = parsed.output
  const mutation = (transaction: Parameters<typeof noteRepositoryCreate>[0]) =>
    noteRepositoryCreate(transaction, userId, {
      ...request,
      organizationId: options.organizationId,
      projectPath: projectPath.data,
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
