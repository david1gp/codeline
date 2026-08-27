import * as os from "node:os"
import * as path from "node:path"
import { createResultError } from "@adaptive-ds/result"
import * as v from "valibot"
import { commandCatalogDiscover } from "../../commands/actions/commandCatalogDiscover.js"
import { commandExecutionOverridesValidate } from "../../commands/actions/commandExecutionOverridesValidate.js"
import { commandExpand } from "../../commands/actions/commandExpand.js"
import { commandShellInterpolationResolve } from "../../commands/actions/commandShellInterpolationResolve.js"
import { commandSubtaskSelectionValidate } from "../../commands/actions/commandSubtaskSelectionValidate.js"
import type { CommandSnapshot } from "../../commands/schema/commandSnapshotSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { agentInstructionsDiscover } from "../../instructions/actions/agentInstructionsDiscover.js"
import { agentInstructionsSnapshotResolve } from "../../instructions/actions/agentInstructionsSnapshotResolve.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { runExecutionManifestSelectionResolve } from "../../run/actions/runExecutionManifestSelectionResolve.js"
import { skillCatalogDiscover } from "../../skills/actions/skillCatalogDiscover.js"
import { skillPresetCatalogLoad } from "../../skills/actions/skillPresetCatalogLoad.js"
import { skillSelectionDefaultLoad } from "../../skills/actions/skillSelectionDefaultLoad.js"
import { skillSelectionPreSessionResolve } from "../../skills/actions/skillSelectionPreSessionResolve.js"
import { bashToolCreate } from "../../tools/runtime/bashToolCreate.js"
import { toolRegistryCreate } from "../../tools/runtime/toolRegistryCreate.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionRepositoryCreate } from "../db/sessionRepositoryCreate.js"
import { sessionExecutionSelectionSchema } from "../schema/sessionExecutionSelectionSchema.js"
import { sessionExecutionSelectionAgentDefaultsLoad } from "./sessionExecutionSelectionAgentDefaultsLoad.js"
import { sessionExecutionSelectionDefaultLoad } from "./sessionExecutionSelectionDefaultLoad.js"
import { sessionExecutionSelectionResolve } from "./sessionExecutionSelectionResolve.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"

function sessionExecutionSelectionPrimaryAgentReplace(input: unknown, primaryAgentId: string): unknown {
  const parsed = v.safeParse(sessionExecutionSelectionSchema, input)
  if (!parsed.success) return input
  return {
    ...parsed.output,
    tools: {
      ...parsed.output.tools,
      primary: { ...parsed.output.tools.primary, agentId: primaryAgentId },
      selectableSubagents: parsed.output.tools.selectableSubagents.filter(({ agentId }) => agentId !== primaryAgentId),
    },
  }
}

export async function sessionCreate(
  database: DatabaseClient,
  userId: string,
  input: Omit<
    Parameters<typeof sessionRepositoryCreate>[3],
    "instructionSnapshot" | "metadata" | "projectPath" | "pinned"
  > & {
    command?: { arguments?: string; name: string }
    metadata?: Record<string, unknown>
    projectPath?: string
  },
  options: {
    agentInstructionsDiscover?: typeof agentInstructionsDiscover
    commandCatalogDiscover?: typeof commandCatalogDiscover
    globalCommandsPath?: string
    globalSkillsPath?: string
    globalAgentsPath?: string
    idempotencyKey?: string
    journal?: {
      postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
      resolveRecipients: JournalEventRecipientResolver
    }
    organizationId: string
    providerAgentCatalog?: ProviderCatalog
    projectRootDirs?: readonly string[]
    requestHash?: string
    signal?: AbortSignal
    skillCatalogDiscover?: typeof skillCatalogDiscover
    skillPresetCatalogLoad?: typeof skillPresetCatalogLoad
  },
): ReturnType<typeof sessionRepositoryCreate> {
  const projectPath = await projectPathReferenceResolve(input.projectPath, options.projectRootDirs ?? [])
  if (!projectPath.success) return createResultError("sessionCreate", projectPath.errorMessage)

  const instructionProjectRoot = projectPath.data === "~" ? path.resolve(os.homedir()) : projectPath.data
  const discoveredInstructions = await (options.agentInstructionsDiscover ?? agentInstructionsDiscover)({
    globalAgentsPath: options.globalAgentsPath,
    projectRoot: instructionProjectRoot,
  })
  if (!discoveredInstructions.success)
    return createResultError("sessionCreate", "The agent instructions could not be resolved.")
  const instructionSnapshot = agentInstructionsSnapshotResolve(discoveredInstructions.data)
  if (!instructionSnapshot.success)
    return createResultError("sessionCreate", "The agent instruction snapshot is invalid.")

  const discoveredCommands = await (options.commandCatalogDiscover ?? commandCatalogDiscover)({
    ...(options.globalCommandsPath === undefined ? {} : { globalCommandsPath: options.globalCommandsPath }),
    projectRoot: instructionProjectRoot,
  })
  if (!discoveredCommands.success)
    return createResultError("sessionCreate", "The command catalog could not be resolved.")
  let primaryAgentId = input.primaryAgentId
  let commandMetadata: Record<string, unknown> = {}
  let commandExpandedText: string | undefined
  let commandSnapshot: CommandSnapshot | undefined
  let commandOverrides: Awaited<ReturnType<typeof commandExecutionOverridesValidate>> | undefined
  let commandSubtaskAgentId: string | undefined
  if (input.command !== undefined) {
    const command = discoveredCommands.data.commands.find(({ name }) => name === input.command?.name)
    if (command === undefined) return createResultError("sessionCreate", "The requested command could not be found.")
    commandSnapshot = command
    const expanded = commandExpand({
      arguments: input.command.arguments,
      catalogDigest: discoveredCommands.data.digest,
      command,
    })
    if (!expanded.success) return createResultError("sessionCreate", expanded.errorMessage)
    const overrides = await commandExecutionOverridesValidate(
      database,
      {
        overrides: expanded.data.overrides,
        primaryAgentId: input.primaryAgentId,
        serverId: input.serverId,
      },
      { allowAgentOverride: true, catalog: options.providerAgentCatalog },
    )
    if (!overrides.success) return createResultError("sessionCreate", overrides.errorMessage)
    if (overrides.data.overrides.subtask === true) commandSubtaskAgentId = overrides.data.agentId
    else primaryAgentId = overrides.data.agentId
    commandOverrides = overrides
    commandExpandedText = expanded.data.expandedText
  }

  const discoveredSkills = await (options.skillCatalogDiscover ?? skillCatalogDiscover)({
    ...(options.globalSkillsPath === undefined ? {} : { globalSkillsPath: options.globalSkillsPath }),
    projectRoot: instructionProjectRoot,
  })
  if (!discoveredSkills.success) return createResultError("sessionCreate", "The skill catalog could not be resolved.")
  const presetCatalog = await (options.skillPresetCatalogLoad ?? skillPresetCatalogLoad)({
    projectRoot: instructionProjectRoot,
  })
  if (!presetCatalog.success)
    return createResultError("sessionCreate", "The skill preset catalog could not be resolved.")

  const savedSkillDefault = await skillSelectionDefaultLoad(database, userId, projectPath.data, {
    projectRootDirs: options.projectRootDirs,
  })
  if (!savedSkillDefault.success) return createResultError("sessionCreate", savedSkillDefault.errorMessage)
  const skillSelection = skillSelectionPreSessionResolve({
    catalog: discoveredSkills.data,
    defaultPreference:
      savedSkillDefault.data === undefined
        ? undefined
        : { override: savedSkillDefault.data.selectionOverride, presetName: savedSkillDefault.data.presetName },
    presetCatalog: presetCatalog.data,
    request: input.skillSelection,
  })
  if (!skillSelection.success) return createResultError("sessionCreate", skillSelection.errorMessage)

  const explicitSelection =
    primaryAgentId === input.primaryAgentId
      ? input.executionSelection
      : sessionExecutionSelectionPrimaryAgentReplace(input.executionSelection, primaryAgentId)
  let savedSelection: unknown
  if (explicitSelection === undefined) {
    const saved = await sessionExecutionSelectionDefaultLoad(database, userId, projectPath.data, {
      projectRootDirs: options.projectRootDirs,
    })
    if (!saved.success) return createResultError("sessionCreate", saved.errorMessage)
    savedSelection = sessionExecutionSelectionPrimaryAgentReplace(saved.data?.executionSelection, primaryAgentId)
  }

  let agentDefaults: unknown
  if (explicitSelection === undefined && savedSelection === undefined) {
    const defaults = await sessionExecutionSelectionAgentDefaultsLoad(database, input.serverId, primaryAgentId, {
      catalog: options.providerAgentCatalog,
    })
    if (!defaults.success) return createResultError("sessionCreate", defaults.errorMessage)
    agentDefaults = defaults.data
  }

  const resolvedExecutionSelection = sessionExecutionSelectionResolve({
    agentDefaults,
    catalog: options.providerAgentCatalog,
    explicit: explicitSelection,
    primaryAgentId,
    saved: savedSelection,
  })
  if (!resolvedExecutionSelection.success) return resolvedExecutionSelection
  const executionSelection = resolvedExecutionSelection.data
  if (commandSubtaskAgentId !== undefined) {
    const subtaskSelection = commandSubtaskSelectionValidate({
      primaryAgentId,
      selection: executionSelection,
      subtaskAgentId: commandSubtaskAgentId,
      ...(options.providerAgentCatalog === undefined ? {} : { catalog: options.providerAgentCatalog }),
    })
    if (!subtaskSelection.success) return createResultError("sessionCreate", subtaskSelection.errorMessage)
  }

  if (input.command !== undefined && commandSnapshot !== undefined && commandOverrides?.success === true) {
    const commandRegistry = toolRegistryCreate()
    const registered = commandRegistry.register({
      ...bashToolCreate({ projectRoot: instructionProjectRoot }),
      enabled: executionSelection.tools.primary.tools.bash,
    })
    if (!registered.success) return createResultError("sessionCreate", "The command shell could not be registered.")
    if (commandExpandedText === undefined)
      return createResultError("sessionCreate", "The command expansion is missing.")
    const shell = await commandShellInterpolationResolve(commandExpandedText, {
      registry: commandRegistry,
      signal: options.signal ?? new AbortController().signal,
      workingDirectory: instructionProjectRoot,
    })
    // The structured tool failure is propagated so the route can distinguish a
    // disabled bash tool from an aborted or failed interpolation.
    if (!shell.success) return shell
    commandExpandedText = shell.data.trim()
    if (commandExpandedText.length === 0) return createResultError("sessionCreate", "The expanded command is empty.")
    commandMetadata = {
      command: {
        argumentsText: input.command.arguments ?? "",
        catalogDigest: discoveredCommands.data.digest,
        expandedUserText: commandExpandedText,
        name: commandSnapshot.name,
        overrides: commandOverrides.data.overrides,
        ...(commandOverrides.data.execution === undefined ? {} : { execution: commandOverrides.data.execution }),
        templateDigest: commandSnapshot.templateDigest,
        version: 1 as const,
      },
    }
  }

  const executionManifest = runExecutionManifestSelectionResolve({
    agentInstructions: instructionSnapshot.data,
    command:
      commandSnapshot === undefined || commandOverrides?.success !== true
        ? undefined
        : {
            ...(commandOverrides.data.overrides.agent === undefined
              ? {}
              : { agent: commandOverrides.data.overrides.agent }),
            ...(commandOverrides.data.overrides.model === undefined
              ? {}
              : { model: commandOverrides.data.overrides.model }),
            name: commandSnapshot.name,
            ...(commandOverrides.data.overrides.subtask === undefined
              ? {}
              : { subtask: commandOverrides.data.overrides.subtask }),
            templateDigest: commandSnapshot.templateDigest,
            version: 1 as const,
          },
    commandCatalogDigest: discoveredCommands.data.digest,
    catalog: options.providerAgentCatalog,
    primaryAgentId,
    selection: executionSelection,
    skillSelection: skillSelection.data,
  })
  if (!executionManifest.success) return createResultError("sessionCreate", executionManifest.errorMessage)
  const sessionId = uuidv7()
  const { command: _command, ...repositoryInput } = input
  const mutation = (transaction: Parameters<typeof sessionRepositoryCreate>[0]) =>
    sessionRepositoryCreate(transaction, userId, options.organizationId, {
      ...repositoryInput,
      executionManifest: executionManifest.data,
      executionSelection,
      instructionSnapshot: instructionSnapshot.data,
      id: sessionId,
      idempotencyKey: options.idempotencyKey,
      metadata: { ...input.metadata, ...commandMetadata },
      pinned: true,
      projectPath: projectPath.data,
      requestHash: options.requestHash,
      skillSelection: skillSelection.data,
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
