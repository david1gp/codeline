import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CodelineConfigurationDocument } from "../configuration/codelineConfigurationDocumentSchema.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import { configurationStoreRead } from "../configuration/configurationStoreRead.js"
import { configurationStoreWrite } from "../configuration/configurationStoreWrite.js"
import { providerAgentCatalogConfigurationCompile } from "../providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../providers/catalog/providerAgentCatalogLoad.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { exampleDataFixture } from "./exampleDataFixture.js"

type ConfigurationEntry = CodelineConfigurationDocument["agentConfigurations"][number]

const supersededFixtureTargets = new Set([
  "example-server-local\u0000example-agent-codex-lb-luna",
  "example-server-local\u0000example-agent-cliproxyapi-luna",
])

function configurationTargetKey(entry: ConfigurationEntry): string {
  return `${entry.target.serverId}\u0000${entry.target.agentId}`
}

function exampleDataConfigurationDocumentCreate(
  current: CodelineConfigurationDocument | undefined,
  catalog: ProviderCatalog,
): Result<CodelineConfigurationDocument> {
  const fixtureEntries: ConfigurationEntry[] = exampleDataFixture.agents.map((agent) => ({
    configuration: agent.configuration,
    target: { agentId: agent.id, serverId: agent.serverId },
  }))
  const compiled = providerAgentCatalogConfigurationCompile(catalog)
  if (!compiled.success) return createResultError("exampleDataConfigurationDocumentCreate", compiled.errorMessage)
  const catalogEntries: ConfigurationEntry[] = compiled.data.map(({ agent, configuration }) => ({
    configuration,
    target: { agentId: agent.id, serverId: "example-server-local" },
  }))
  const desiredEntries = [...fixtureEntries, ...catalogEntries]
  const fixtureEntriesByTarget = new Map(desiredEntries.map((entry) => [configurationTargetKey(entry), entry]))
  const agentConfigurations =
    current?.agentConfigurations.flatMap((entry) => {
      if (supersededFixtureTargets.has(configurationTargetKey(entry))) return []
      const fixtureEntry = fixtureEntriesByTarget.get(configurationTargetKey(entry))
      if (fixtureEntry === undefined) return [entry]
      fixtureEntriesByTarget.delete(configurationTargetKey(entry))
      return [fixtureEntry]
    }) ?? []

  agentConfigurations.push(...fixtureEntriesByTarget.values())
  return createResult({ agentConfigurations, version: 1 })
}

function exampleDataConfigurationSerialize(document: CodelineConfigurationDocument): string {
  return JSON.stringify(document, (_key, value: unknown) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
  })
}

export async function exampleDataConfigurationReconcile(
  store: ConfigurationStore,
  catalog?: ProviderCatalog,
): Promise<Result<{ changed: boolean }>> {
  const op = "exampleDataConfigurationReconcile"
  const catalogResult =
    catalog === undefined
      ? await providerAgentCatalogLoad(resolve(dirname(fileURLToPath(import.meta.url)), "../.."))
      : createResult(catalog)
  if (!catalogResult.success) return createResultError(op, catalogResult.errorMessage)
  const read = configurationStoreRead(store)
  if (!read.success && store.snapshot !== undefined) return createResultError(op, read.errorMessage)

  const current = read.success ? (structuredClone(read.data.configuration) as CodelineConfigurationDocument) : undefined
  const configuration = exampleDataConfigurationDocumentCreate(current, catalogResult.data)
  if (!configuration.success) return createResultError(op, configuration.errorMessage)
  if (
    current !== undefined &&
    exampleDataConfigurationSerialize(current) === exampleDataConfigurationSerialize(configuration.data)
  )
    return createResult({ changed: false })

  const written = await configurationStoreWrite(store, configuration.data)
  if (!written.success) return createResultError(op, written.errorMessage)
  return createResult({ changed: true })
}
