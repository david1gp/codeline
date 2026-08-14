import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CodelineConfigurationDocument } from "../configuration/codelineConfigurationDocumentSchema.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import { configurationStoreRead } from "../configuration/configurationStoreRead.js"
import { configurationStoreWrite } from "../configuration/configurationStoreWrite.js"
import { exampleDataFixture } from "./exampleDataFixture.js"

type ConfigurationEntry = CodelineConfigurationDocument["agentConfigurations"][number]

function configurationTargetKey(entry: ConfigurationEntry): string {
  return `${entry.target.serverId}\u0000${entry.target.agentId}`
}

function exampleDataConfigurationDocumentCreate(
  current: CodelineConfigurationDocument | undefined,
): CodelineConfigurationDocument {
  const fixtureEntries: ConfigurationEntry[] = exampleDataFixture.agents.map((agent) => ({
    configuration: agent.configuration,
    target: { agentId: agent.id, serverId: agent.serverId },
  }))
  const fixtureEntriesByTarget = new Map(fixtureEntries.map((entry) => [configurationTargetKey(entry), entry]))
  const agentConfigurations =
    current?.agentConfigurations.map((entry) => {
      const fixtureEntry = fixtureEntriesByTarget.get(configurationTargetKey(entry))
      if (fixtureEntry === undefined) return entry
      fixtureEntriesByTarget.delete(configurationTargetKey(entry))
      return fixtureEntry
    }) ?? []

  agentConfigurations.push(...fixtureEntriesByTarget.values())
  return { agentConfigurations, version: 1 }
}

function exampleDataConfigurationSerialize(document: CodelineConfigurationDocument): string {
  return JSON.stringify(document, (_key, value: unknown) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
  })
}

export async function exampleDataConfigurationReconcile(
  store: ConfigurationStore,
): Promise<Result<{ changed: boolean }>> {
  const op = "exampleDataConfigurationReconcile"
  const read = configurationStoreRead(store)
  if (!read.success && store.snapshot !== undefined) return createResultError(op, read.errorMessage)

  const current = read.success ? (structuredClone(read.data.configuration) as CodelineConfigurationDocument) : undefined
  const configuration = exampleDataConfigurationDocumentCreate(current)
  if (
    current !== undefined &&
    exampleDataConfigurationSerialize(current) === exampleDataConfigurationSerialize(configuration)
  )
    return createResult({ changed: false })

  const written = await configurationStoreWrite(store, configuration)
  if (!written.success) return createResultError(op, written.errorMessage)
  return createResult({ changed: true })
}
