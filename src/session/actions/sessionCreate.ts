import { createResultError } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionRepositoryCreate } from "../db/sessionRepositoryCreate.js"
import { sessionExecutionSelectionAgentDefaultsLoad } from "./sessionExecutionSelectionAgentDefaultsLoad.js"
import { sessionExecutionSelectionDefaultLoad } from "./sessionExecutionSelectionDefaultLoad.js"
import { sessionExecutionSelectionResolve } from "./sessionExecutionSelectionResolve.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"

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
    providerAgentCatalog?: ProviderCatalog
    projectRootDirs?: readonly string[]
    requestHash?: string
  },
): ReturnType<typeof sessionRepositoryCreate> {
  const projectPath = await projectPathReferenceResolve(input.projectPath, options.projectRootDirs ?? [])
  if (!projectPath.success) return createResultError("sessionCreate", projectPath.errorMessage)

  const explicitSelection = input.executionSelection ?? undefined
  let savedSelection: unknown
  if (explicitSelection === undefined) {
    const saved = await sessionExecutionSelectionDefaultLoad(database, userId, projectPath.data, {
      projectRootDirs: options.projectRootDirs,
    })
    if (!saved.success) return createResultError("sessionCreate", saved.errorMessage)
    savedSelection = saved.data?.executionSelection
  }

  let agentDefaults: unknown
  if (explicitSelection === undefined && savedSelection === undefined) {
    const defaults = await sessionExecutionSelectionAgentDefaultsLoad(database, input.serverId, input.primaryAgentId, {
      catalog: options.providerAgentCatalog,
    })
    if (!defaults.success) return createResultError("sessionCreate", defaults.errorMessage)
    agentDefaults = defaults.data
  }

  const resolvedExecutionSelection = sessionExecutionSelectionResolve({
    agentDefaults,
    catalog: options.providerAgentCatalog,
    explicit: explicitSelection,
    primaryAgentId: input.primaryAgentId,
    saved: savedSelection,
  })
  if (!resolvedExecutionSelection.success) return resolvedExecutionSelection
  const executionSelection = resolvedExecutionSelection.data
  const sessionId = uuidv7()
  const mutation = (transaction: Parameters<typeof sessionRepositoryCreate>[0]) =>
    sessionRepositoryCreate(transaction, userId, options.organizationId, {
      ...input,
      executionSelection,
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
