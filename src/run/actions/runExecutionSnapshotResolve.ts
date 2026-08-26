import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { agentConfigurationExecutionResolve } from "../../agents/actions/agentConfigurationExecutionResolve.js"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { agentExecutionTargetSchema } from "../../agents/schema/agentExecutionTargetSchema.js"
import type { ConfigurationStore } from "../../configuration/configurationStore.js"
import { configurationStoreRead } from "../../configuration/configurationStoreRead.js"
import { providerAgentCatalogExecutionResolve } from "../../providers/catalog/providerAgentCatalogExecutionResolve.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import { runExecutionSnapshotSchema } from "../schema/runExecutionSnapshotSchema.js"

type RunExecutionSnapshotResolveOptions = {
  catalog?: ProviderCatalog
  configuration?: unknown
  configurationRevision?: unknown
  configurationStoreRead?: typeof configurationStoreRead
  execution?: unknown
  override?: unknown
  providerAgentCatalog?: ProviderCatalog
}

function runExecutionSnapshotDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value

  Object.freeze(value)
  for (const child of Object.values(value)) runExecutionSnapshotDeepFreeze(child)
  return value
}

export function runExecutionSnapshotResolve(
  target: unknown,
  store: ConfigurationStore,
  options: RunExecutionSnapshotResolveOptions = {},
): Result<RunExecutionSnapshot> {
  const op = "runExecutionSnapshotResolve"
  const parsedTarget = v.safeParse(agentExecutionTargetSchema, target)
  if (!parsedTarget.success)
    return runResultCreateError(op, "The run execution target is invalid.", runErrorCodes.executionTargetInvalid)

  const read = (options.configurationStoreRead ?? configurationStoreRead)(store)
  if (!read.success) return read

  const entry = read.data.configuration.agentConfigurations.find(
    ({ target: configuredTarget }) =>
      configuredTarget.serverId === parsedTarget.output.serverId &&
      configuredTarget.agentId === parsedTarget.output.agentId,
  )
  if (entry === undefined && options.configuration === undefined)
    return runResultCreateError(
      op,
      "The run execution target is not configured.",
      runErrorCodes.executionTargetUnconfigured,
    )

  const configuration = options.configuration ?? entry?.configuration
  if (configuration === undefined)
    return runResultCreateError(
      op,
      "The run execution target is not configured.",
      runErrorCodes.executionTargetUnconfigured,
    )

  let snapshotConfiguration = configuration
  let agentPrompt: string | undefined
  let catalogRevision: string | undefined
  let modelMetadata: ProviderCatalog["providers"][number]["models"][number] | undefined
  const catalog = options.catalog ?? options.providerAgentCatalog
  const execution = options.execution ?? options.override

  if (catalog?.agents.some((agent) => agent.id === parsedTarget.output.agentId)) {
    const resolved = providerAgentCatalogExecutionResolve(
      catalog,
      parsedTarget.output.agentId,
      configuration,
      execution,
    )
    if (!resolved.success) return resolved
    snapshotConfiguration = resolved.data.configuration
    agentPrompt = resolved.data.prompt
    catalogRevision = catalog.revision
    modelMetadata = resolved.data.modelMetadata
  } else {
    const resolved = agentConfigurationExecutionResolve(configuration, execution, parsedTarget.output.agentId)
    if (!resolved.success) return resolved
    snapshotConfiguration = resolved.data
  }

  const parsedSnapshotConfiguration = v.safeParse(agentConfigurationSchema, snapshotConfiguration)
  if (!parsedSnapshotConfiguration.success)
    return runResultCreateError(op, "The run execution snapshot is invalid.", runErrorCodes.executionSnapshotInvalid)
  snapshotConfiguration = parsedSnapshotConfiguration.output
  if (modelMetadata === undefined && parsedSnapshotConfiguration.output.provider !== "deterministic") {
    catalogRevision = parsedSnapshotConfiguration.output.catalogRevision
    modelMetadata = parsedSnapshotConfiguration.output.modelMetadata
  }

  const parsedSnapshot = v.safeParse(
    runExecutionSnapshotSchema,
    structuredClone({
      ...(agentPrompt === undefined ? {} : { agentPrompt }),
      ...(catalogRevision === undefined ? {} : { catalogRevision }),
      configuration: snapshotConfiguration,
      configurationRevision: options.configurationRevision ?? read.data.revision,
      ...(modelMetadata === undefined ? {} : { modelMetadata }),
      target: parsedTarget.output,
    }),
  )
  if (!parsedSnapshot.success)
    return runResultCreateError(op, "The run execution snapshot is invalid.", runErrorCodes.executionSnapshotInvalid)

  return createResult(runExecutionSnapshotDeepFreeze(parsedSnapshot.output))
}
