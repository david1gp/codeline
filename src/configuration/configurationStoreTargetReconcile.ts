import { createResult, createResultError } from "@adaptive-ds/result"
import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import type { CodelineConfigurationDocument } from "./codelineConfigurationDocumentSchema.js"
import type { ConfigurationStore } from "./configurationStore.js"
import { configurationStoreRead } from "./configurationStoreRead.js"
import { configurationStoreWrite } from "./configurationStoreWrite.js"

export async function configurationStoreTargetReconcile(
  store: ConfigurationStore,
  target: { serverId: string; agentId: string },
  configuration: AgentConfiguration,
) {
  const op = "configurationStoreTargetReconcile"
  const read = configurationStoreRead(store)
  if (!read.success && store.snapshot !== undefined) return createResultError(op, read.errorMessage)
  const current = read.success ? (structuredClone(read.data.configuration) as CodelineConfigurationDocument) : undefined
  const entries = current?.agentConfigurations ?? []
  const existing = entries.find(
    (entry) => entry.target.serverId === target.serverId && entry.target.agentId === target.agentId,
  )
  if (existing !== undefined && JSON.stringify(existing.configuration) === JSON.stringify(configuration))
    return createResult(undefined)
  const document: CodelineConfigurationDocument = {
    agentConfigurations: [
      ...entries.filter(
        (entry) => entry.target.serverId !== target.serverId || entry.target.agentId !== target.agentId,
      ),
      { target, configuration },
    ],
    version: 1,
  }
  const written = await configurationStoreWrite(store, document)
  if (!written.success) return createResultError(op, written.errorMessage)
  return createResult(undefined)
}
