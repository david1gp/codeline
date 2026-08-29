import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { agentConfigurationExecutionResolve } from "../../agents/actions/agentConfigurationExecutionResolve.js"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { agentExecutionTargetSchema } from "../../agents/schema/agentExecutionTargetSchema.js"
import { agentToolDefaultsSchema } from "../../agents/schema/agentToolDefaultsSchema.js"
import { commandExecutionManifestSchema } from "../../commands/schema/commandExecutionManifestSchema.js"
import type { ConfigurationStore } from "../../configuration/configurationStore.js"
import { configurationStoreRead } from "../../configuration/configurationStoreRead.js"
import { agentInstructionsSnapshotResolve } from "../../instructions/actions/agentInstructionsSnapshotResolve.js"
import type { AgentInstructionsResolvedSnapshot } from "../../instructions/schema/agentInstructionsResolvedSnapshotSchema.js"
import { providerAgentCatalogExecutionResolve } from "../../providers/catalog/providerAgentCatalogExecutionResolve.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import type { ToolName } from "../../tools/schema/toolNameSchema.js"
import { sessionAgentPromptSchema } from "../../session/schema/sessionAgentPromptSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunExecutionManifest, runExecutionManifestSchema } from "../schema/runExecutionManifestSchema.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import { runExecutionSnapshotSchema } from "../schema/runExecutionSnapshotSchema.js"
import { runExecutionManifestSelectionResolve } from "./runExecutionManifestSelectionResolve.js"
import { runExecutionManifestToolDefaultsResolve } from "./runExecutionManifestToolDefaultsResolve.js"

type RunExecutionSnapshotResolveOptions = {
  agentPrompt?: unknown
  agentInstructions?: unknown
  command?: unknown
  commandCatalogDigest?: string | null
  catalog?: ProviderCatalog
  configuration?: unknown
  configurationRevision?: unknown
  configurationStoreRead?: typeof configurationStoreRead
  executionManifest?: unknown
  executionSelection?: unknown
  skillSelection?: unknown
  execution?: unknown
  override?: unknown
  providerAgentCatalog?: ProviderCatalog
}

function runExecutionManifestDefaultToolsResolve(defaults: v.InferInput<typeof agentToolDefaultsSchema>): ToolName[] {
  return [
    ...(defaults.bash ? ["bash" as const] : []),
    ...(defaults.webfetch ? ["webfetch" as const] : []),
    ...(defaults.read ? ["read" as const] : []),
    ...(defaults.write ? ["write" as const] : []),
    ...(defaults.edit ? ["edit" as const] : []),
    "skill",
    "delegate_task",
  ]
}

function runExecutionManifestDefaultCreate(
  target: { agentId: string },
  configuration: { tools?: v.InferInput<typeof agentToolDefaultsSchema> },
  commandCatalogDigest?: string | null,
  command?: RunExecutionManifest["command"],
): RunExecutionManifest {
  return {
    commandCatalog: { digest: commandCatalogDigest ?? null, version: 1 },
    ...(command === undefined ? {} : { command }),
    instructions: { snapshots: [], version: 1 },
    skills: { snapshots: [], version: 1 },
    tools: {
      primary: {
        agentId: target.agentId,
        tools: runExecutionManifestDefaultToolsResolve(configuration.tools ?? { bash: false, webfetch: false }),
      },
      selectableSubagents: [],
    },
    version: 1,
  }
}

function runExecutionSnapshotJsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(runExecutionSnapshotJsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${runExecutionSnapshotJsonCanonicalize((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`
}

function runExecutionManifestResolve(
  target: { agentId: string },
  configuration: { tools?: v.InferInput<typeof agentToolDefaultsSchema> },
  options: RunExecutionSnapshotResolveOptions,
): RunExecutionManifest | null {
  const parsedCommand =
    options.command === undefined ? undefined : v.safeParse(commandExecutionManifestSchema, options.command)
  if (options.command !== undefined && !parsedCommand?.success) return null
  const persistedManifest =
    options.executionManifest === undefined
      ? undefined
      : v.safeParse(runExecutionManifestSchema, options.executionManifest)
  if (options.executionManifest !== undefined && !persistedManifest?.success) return null
  const command = parsedCommand?.success
    ? parsedCommand.output
    : persistedManifest?.success
      ? persistedManifest.output.command
      : undefined
  const commandCatalogDigest =
    options.commandCatalogDigest ?? (persistedManifest?.success ? persistedManifest.output.commandCatalog.digest : null)
  let instructions: AgentInstructionsResolvedSnapshot | undefined
  if (options.agentInstructions !== undefined) {
    const resolvedInstructions = agentInstructionsSnapshotResolve(options.agentInstructions)
    if (!resolvedInstructions.success) return null
    instructions = resolvedInstructions.data
  }

  const manifestSelection =
    options.executionSelection ??
    (options.skillSelection === undefined
      ? undefined
      : {
          tools: {
            primary: { agentId: target.agentId, tools: configuration.tools ?? {} },
            selectableSubagents: [],
          },
          version: 1 as const,
        })
  const selection =
    manifestSelection === undefined
      ? undefined
      : runExecutionManifestSelectionResolve({
          agentInstructions: options.agentInstructions,
          catalog: options.catalog ?? options.providerAgentCatalog,
          command,
          commandCatalogDigest,
          primaryAgentId: target.agentId,
          selection: manifestSelection,
          ...(options.skillSelection === undefined ? {} : { skillSelection: options.skillSelection }),
        })
  if (selection !== undefined && !selection.success) return null

  if (options.executionManifest !== undefined) {
    if (!persistedManifest?.success || persistedManifest.output.tools.primary.agentId !== target.agentId) return null
    if (
      command !== undefined &&
      runExecutionSnapshotJsonCanonicalize(persistedManifest.output.command) !==
        runExecutionSnapshotJsonCanonicalize(command)
    )
      return null
    if (
      selection !== undefined &&
      runExecutionSnapshotJsonCanonicalize(persistedManifest.output) !==
        runExecutionSnapshotJsonCanonicalize(selection.data)
    )
      return null
    if (
      instructions !== undefined &&
      runExecutionSnapshotJsonCanonicalize(persistedManifest.output.instructions) !==
        runExecutionSnapshotJsonCanonicalize(instructions)
    )
      return null
    return persistedManifest.output
  }

  if (selection !== undefined) {
    if (instructions === undefined) return selection.data
    return { ...selection.data, instructions }
  }
  if (instructions === undefined)
    return runExecutionManifestDefaultCreate(target, configuration, commandCatalogDigest, command)
  return {
    ...runExecutionManifestDefaultCreate(target, configuration, commandCatalogDigest, command),
    instructions,
  }
}

function runExecutionSnapshotDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value

  Object.freeze(value)
  for (const child of Object.values(value)) runExecutionSnapshotDeepFreeze(child)
  return value
}

export function runExecutionSnapshotResolve(
  target: unknown,
  store?: ConfigurationStore,
  options: RunExecutionSnapshotResolveOptions = {},
): Result<RunExecutionSnapshot> {
  const op = "runExecutionSnapshotResolve"
  const parsedTarget = v.safeParse(agentExecutionTargetSchema, target)
  if (!parsedTarget.success)
    return runResultCreateError(op, "The run execution target is invalid.", runErrorCodes.executionTargetInvalid)

  const read = store === undefined ? undefined : (options.configurationStoreRead ?? configurationStoreRead)(store)
  if (read !== undefined && !read.success) return read

  const entry = read?.data.configuration.agentConfigurations.find(
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

  if (options.agentPrompt !== undefined) {
    const parsedAgentPrompt = v.safeParse(sessionAgentPromptSchema, options.agentPrompt)
    if (!parsedAgentPrompt.success)
      return runResultCreateError(
        op,
        "The run execution snapshot prompt is invalid.",
        runErrorCodes.executionSnapshotInvalid,
      )
    agentPrompt = parsedAgentPrompt.output
  }

  const parsedSnapshotConfiguration = v.safeParse(agentConfigurationSchema, snapshotConfiguration)
  if (!parsedSnapshotConfiguration.success)
    return runResultCreateError(op, "The run execution snapshot is invalid.", runErrorCodes.executionSnapshotInvalid)
  snapshotConfiguration = parsedSnapshotConfiguration.output
  if (modelMetadata === undefined && parsedSnapshotConfiguration.output.provider !== "deterministic") {
    catalogRevision = parsedSnapshotConfiguration.output.catalogRevision
    modelMetadata = parsedSnapshotConfiguration.output.modelMetadata
  }

  const executionManifest = runExecutionManifestResolve(
    parsedTarget.output,
    parsedSnapshotConfiguration.output,
    options,
  )
  if (executionManifest === null)
    return runResultCreateError(op, "The run execution manifest is invalid.", runErrorCodes.executionSnapshotInvalid)

  const effectiveTools = runExecutionManifestToolDefaultsResolve(executionManifest.tools.primary.tools)
  const configurationWithEffectiveTools = v.safeParse(agentConfigurationSchema, {
    ...snapshotConfiguration,
    tools: effectiveTools,
  })
  if (!configurationWithEffectiveTools.success)
    return runResultCreateError(
      op,
      "The run execution snapshot configuration is invalid.",
      runErrorCodes.executionSnapshotInvalid,
    )
  snapshotConfiguration = configurationWithEffectiveTools.output

  const parsedSnapshot = v.safeParse(
    runExecutionSnapshotSchema,
    structuredClone({
      ...(agentPrompt === undefined ? {} : { agentPrompt }),
      ...(catalogRevision === undefined ? {} : { catalogRevision }),
      configuration: snapshotConfiguration,
      configurationRevision: options.configurationRevision ?? read?.data.revision,
      executionManifest,
      ...(modelMetadata === undefined ? {} : { modelMetadata }),
      target: parsedTarget.output,
    }),
  )
  if (!parsedSnapshot.success)
    return runResultCreateError(op, "The run execution snapshot is invalid.", runErrorCodes.executionSnapshotInvalid)

  return createResult(runExecutionSnapshotDeepFreeze(parsedSnapshot.output))
}
