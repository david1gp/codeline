import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { ConfigurationStore } from "../../configuration/configurationStore.js"
import { globalAgentPresetDocumentRead } from "../../configuration/globalAgentPresetStore.js"
import { globalAgentPresetResourcesResolveForPreset } from "../../configuration/globalAgentPresetResourcesResolve.js"
import type { GlobalAgentPresetDocument } from "../../configuration/globalAgentPresetDocumentSchema.js"
import { commandCatalogDiscover } from "../../commands/actions/commandCatalogDiscover.js"
import { commandExecutionOverridesValidate } from "../../commands/actions/commandExecutionOverridesValidate.js"
import { commandExpand } from "../../commands/actions/commandExpand.js"
import { commandShellInterpolationResolve } from "../../commands/actions/commandShellInterpolationResolve.js"
import { commandSubtaskSelectionValidate } from "../../commands/actions/commandSubtaskSelectionValidate.js"
import type { CommandSnapshot } from "../../commands/schema/commandSnapshotSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { agentInstructionsDiscover } from "../../instructions/actions/agentInstructionsDiscover.js"
import { agentInstructionsSnapshotOverrideApply } from "../../instructions/actions/agentInstructionsSnapshotOverrideApply.js"
import { agentInstructionsSnapshotResolve } from "../../instructions/actions/agentInstructionsSnapshotResolve.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { projectPathReferenceResolve } from "../../project/actions/projectPathReferenceResolve.js"
import { projectResolve } from "../../project/actions/projectResolve.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { providerAgentCatalogProjectResolve } from "../../providers/catalog/providerAgentCatalogProjectResolve.js"
import { providerAgentCatalogConfigurationResolve } from "../../providers/catalog/providerAgentCatalogConfigurationResolve.js"
import { runExecutionManifestSelectionResolve } from "../../run/actions/runExecutionManifestSelectionResolve.js"
import { skillCatalogDiscover } from "../../skills/actions/skillCatalogDiscover.js"
import { skillPresetCatalogLoad } from "../../skills/actions/skillPresetCatalogLoad.js"
import { skillSelectionDefaultLoad } from "../../skills/actions/skillSelectionDefaultLoad.js"
import { skillSelectionPreSessionResolve } from "../../skills/actions/skillSelectionPreSessionResolve.js"
import { skillSelectionResolve } from "../../skills/actions/skillSelectionResolve.js"
import { bashToolCreate } from "../../tools/runtime/bashToolCreate.js"
import { toolRegistryCreate } from "../../tools/runtime/toolRegistryCreate.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionRepositoryCreate } from "../db/sessionRepositoryCreate.js"
import { sessionRepositoryCreateReplayLoad } from "../db/sessionRepositoryCreateReplayLoad.js"
import { sessionExecutionSelectionSchema } from "../schema/sessionExecutionSelectionSchema.js"
import { sessionExecutionSelectionAgentDefaultsLoad } from "./sessionExecutionSelectionAgentDefaultsLoad.js"
import { sessionExecutionSelectionDefaultLoad } from "./sessionExecutionSelectionDefaultLoad.js"
import { sessionExecutionSelectionResolve } from "./sessionExecutionSelectionResolve.js"
import { sessionJournalMutationRun } from "./sessionJournalMutationRun.js"
import { sessionModelDefaultResolve } from "./sessionModelDefaultResolve.js"

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
    globalAgentPresetId?: string
    modelId?: string
    instructionOverrides?: unknown
    metadata?: Record<string, unknown>
    projectId?: string
    projectPath?: string
  },
  options: {
    agentInstructionsDiscover?: typeof agentInstructionsDiscover
    commandCatalogDiscover?: typeof commandCatalogDiscover
    configurationStore?: ConfigurationStore
    globalAgentPresetDocumentRead?: typeof globalAgentPresetDocumentRead
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
  if (options.idempotencyKey !== undefined) {
    const replay = await sessionRepositoryCreateReplayLoad(database, userId, options.organizationId, options)
    if (!replay.success) return replay
    if (replay.data !== undefined) return createResult(replay.data)
  }
  let projectPath: Result<string>
  if (input.projectId === undefined) {
    projectPath = await projectPathReferenceResolve(input.projectPath, options.projectRootDirs ?? [])
  } else {
    const project = await projectResolve(options.projectRootDirs ?? [], input.projectId, {
      database,
      userId,
    })
    if (!project.success) return createResultError("sessionCreate", project.errorMessage)
    projectPath = createResult(project.data.rootDir)
  }
  if (!projectPath.success) return createResultError("sessionCreate", projectPath.errorMessage)
  const projectReferenceRootDirs = input.projectId === undefined ? options.projectRootDirs : [projectPath.data]
  const instructionProjectRoot = projectPath.data === "~" ? path.resolve(os.homedir()) : projectPath.data
  const projectCatalog = await providerAgentCatalogProjectResolve(instructionProjectRoot, options.providerAgentCatalog)
  if (!projectCatalog.success) return createResultError("sessionCreate", projectCatalog.errorMessage)
  const effectiveCatalog = projectCatalog.data.catalog
  const projectPrimary = projectCatalog.data.projectAgentIds.includes(input.primaryAgentId)
    ? effectiveCatalog?.agents.find(({ id }) => id === input.primaryAgentId)
    : undefined
  if (projectPrimary !== undefined && (!projectPrimary.enabled || projectPrimary.mode !== "primary"))
    return createResultError("sessionCreate", "The project primary agent is unavailable.")
  const projectConfiguration =
    projectPrimary === undefined
      ? undefined
      : providerAgentCatalogConfigurationResolve(effectiveCatalog, projectPrimary.id)
  if (projectConfiguration !== undefined && !projectConfiguration.success) return projectConfiguration
  const projectSubagents =
    effectiveCatalog?.agents.filter(
      ({ id, enabled, mode }) =>
        projectCatalog.data.projectAgentIds.includes(id) &&
        enabled &&
        mode !== "primary" &&
        id !== input.primaryAgentId,
    ) ?? []

  // The document is read at creation time; clients never provide effective resource lists.
  let presetDocument: GlobalAgentPresetDocument | undefined
  if (input.globalAgentPresetId !== undefined) {
    if (options.configurationStore === undefined)
      return createResultError("sessionCreate", "The global agent preset store is unavailable.")
    const read = await (options.globalAgentPresetDocumentRead ?? globalAgentPresetDocumentRead)(
      options.configurationStore.gitStore,
    )
    if (!read.success) return createResultError("sessionCreate", "The global agent preset document could not be read.")
    presetDocument = read.data
  }
  const selectedPreset = presetDocument?.presets.find(({ id }) => id === input.globalAgentPresetId)
  if (input.globalAgentPresetId !== undefined && selectedPreset === undefined)
    return createResultError("sessionCreate", "The global agent preset could not be found.")
  if (selectedPreset !== undefined && (input.executionSelection !== undefined || input.skillSelection !== undefined))
    return createResultError(
      "sessionCreate",
      "The global agent preset cannot be combined with client resource selections.",
    )
  if (selectedPreset !== undefined && selectedPreset.executionAgentId !== input.primaryAgentId)
    return createResultError(
      "sessionCreate",
      "The global agent preset execution agent does not match the requested agent.",
    )

  const modelId = input.modelId ?? selectedPreset?.modelId
  const modelDefault =
    modelId === undefined
      ? undefined
      : await sessionModelDefaultResolve(
          database,
          {
            agentId: input.primaryAgentId,
            modelId,
            serverId: input.serverId,
          },
          effectiveCatalog,
        )
  if (modelDefault !== undefined && !modelDefault.success) return modelDefault

  const discoveredInstructions = await (options.agentInstructionsDiscover ?? agentInstructionsDiscover)({
    globalAgentsPath: options.globalAgentsPath,
    projectRoot: instructionProjectRoot,
  })
  if (!discoveredInstructions.success)
    return createResultError("sessionCreate", "The agent instructions could not be resolved.")
  const instructionSnapshot = agentInstructionsSnapshotResolve(discoveredInstructions.data)
  if (!instructionSnapshot.success)
    return createResultError("sessionCreate", "The agent instruction snapshot is invalid.")
  const effectiveInstructionSnapshot = agentInstructionsSnapshotOverrideApply({
    overrides: input.instructionOverrides,
    snapshot: instructionSnapshot.data,
  })
  if (!effectiveInstructionSnapshot.success)
    return createResultError("sessionCreate", effectiveInstructionSnapshot.errorMessage)

  const discoveredCommands = await (options.commandCatalogDiscover ?? commandCatalogDiscover)({
    ...(options.globalCommandsPath === undefined ? {} : { globalCommandsPath: options.globalCommandsPath }),
    projectRoot: instructionProjectRoot,
  })
  if (!discoveredCommands.success)
    return createResultError("sessionCreate", "The command catalog could not be resolved.")
  const globalCommandNames = [
    ...discoveredCommands.data.commands.filter(({ source }) => source === "global").map(({ name }) => name),
    ...discoveredCommands.data.collisions
      .filter(({ candidates }) => candidates.some(({ source }) => source === "global"))
      .map(({ name }) => name),
  ]
  const allowedCommandNames =
    selectedPreset === undefined || presetDocument === undefined
      ? undefined
      : new Set([
          ...(globalAgentPresetResourcesResolveForPreset(
            presetDocument,
            "commands",
            selectedPreset.id,
            globalCommandNames,
          ) ?? []),
          ...discoveredCommands.data.commands.filter(({ source }) => source === "project").map(({ name }) => name),
        ])
  if (
    allowedCommandNames !== undefined &&
    [...allowedCommandNames].some((name) => !discoveredCommands.data.commands.some((command) => command.name === name))
  )
    return createResultError("sessionCreate", "The global agent preset references an unavailable command.")
  let primaryAgentId = input.primaryAgentId
  let commandMetadata: Record<string, unknown> = {}
  let commandExpandedText: string | undefined
  let commandSnapshot: CommandSnapshot | undefined
  let commandOverrides: Awaited<ReturnType<typeof commandExecutionOverridesValidate>> | undefined
  let commandSubtaskAgentId: string | undefined
  if (input.command !== undefined) {
    const command = discoveredCommands.data.commands.find(
      ({ name }) =>
        name === input.command?.name && (allowedCommandNames === undefined || allowedCommandNames.has(name)),
    )
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
      {
        allowAgentOverride: true,
        catalog: effectiveCatalog,
        ...(projectConfiguration === undefined ||
        (expanded.data.overrides.agent !== undefined && expanded.data.overrides.agent !== input.primaryAgentId)
          ? {}
          : { configuration: projectConfiguration.data }),
      },
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
  const presetSkills =
    selectedPreset === undefined || presetDocument === undefined
      ? undefined
      : [
          ...new Set([
            ...(globalAgentPresetResourcesResolveForPreset(
              presetDocument,
              "skills",
              selectedPreset.id,
              discoveredSkills.data.bundles.filter(({ source }) => source === "global").map(({ name }) => name),
            ) ?? []),
            ...discoveredSkills.data.skills.filter(({ source }) => source === "project").map(({ name }) => name),
          ]),
        ]
  if (
    presetSkills !== undefined &&
    presetSkills.some((name) => !discoveredSkills.data.skills.some((skill) => skill.name === name))
  )
    return createResultError("sessionCreate", "The global agent preset references an unavailable skill.")
  let skillSelection: ReturnType<typeof skillSelectionResolve> | undefined
  if (presetSkills !== undefined) {
    skillSelection = skillSelectionResolve({
      catalog: discoveredSkills.data,
      preset: { name: "default", includeSkills: presetSkills, version: 1 },
    })
    if (!skillSelection.success) return skillSelection
  }
  if (skillSelection === undefined) {
    const presetCatalog = await (options.skillPresetCatalogLoad ?? skillPresetCatalogLoad)({
      projectRoot: instructionProjectRoot,
    })
    if (!presetCatalog.success)
      return createResultError("sessionCreate", "The skill preset catalog could not be resolved.")

    const savedSkillDefault = await skillSelectionDefaultLoad(database, userId, projectPath.data, {
      projectRootDirs: projectReferenceRootDirs,
    })
    if (!savedSkillDefault.success) return createResultError("sessionCreate", savedSkillDefault.errorMessage)
    skillSelection = skillSelectionPreSessionResolve({
      catalog: discoveredSkills.data,
      defaultPreference:
        savedSkillDefault.data === undefined
          ? undefined
          : { override: savedSkillDefault.data.selectionOverride, presetName: savedSkillDefault.data.presetName },
      presetCatalog: presetCatalog.data,
      request: input.skillSelection,
    })
  }
  if (!skillSelection.success) return createResultError("sessionCreate", skillSelection.errorMessage)

  const explicitSelection =
    primaryAgentId === input.primaryAgentId
      ? input.executionSelection
      : sessionExecutionSelectionPrimaryAgentReplace(input.executionSelection, primaryAgentId)
  let savedSelection: unknown
  if (explicitSelection === undefined && selectedPreset === undefined) {
    const saved = await sessionExecutionSelectionDefaultLoad(database, userId, projectPath.data, {
      projectRootDirs: projectReferenceRootDirs,
    })
    if (!saved.success) return createResultError("sessionCreate", saved.errorMessage)
    savedSelection = sessionExecutionSelectionPrimaryAgentReplace(saved.data?.executionSelection, primaryAgentId)
  }

  let agentDefaults: unknown
  if (explicitSelection === undefined && savedSelection === undefined && selectedPreset === undefined) {
    const defaults = await sessionExecutionSelectionAgentDefaultsLoad(database, input.serverId, primaryAgentId, {
      catalog: effectiveCatalog,
    })
    if (!defaults.success) return createResultError("sessionCreate", defaults.errorMessage)
    agentDefaults = defaults.data
  }

  const resolvedExecutionSelection = sessionExecutionSelectionResolve({
    agentDefaults,
    catalog: effectiveCatalog,
    explicit: explicitSelection,
    primaryAgentId,
    saved: savedSelection,
  })
  if (!resolvedExecutionSelection.success) return resolvedExecutionSelection
  let executionSelection = resolvedExecutionSelection.data
  if (selectedPreset !== undefined && presetDocument !== undefined) {
    const toolNames =
      globalAgentPresetResourcesResolveForPreset(presetDocument, "tools", selectedPreset.id, [
        "bash",
        "webfetch",
        "read",
        "write",
        "edit",
      ]) ?? []
    if (toolNames.some((name) => !["bash", "webfetch", "read", "write", "edit"].includes(name)))
      return createResultError("sessionCreate", "The global agent preset references an unavailable tool.")
    const subagentNames =
      globalAgentPresetResourcesResolveForPreset(
        presetDocument,
        "subagents",
        selectedPreset.id,
        effectiveCatalog?.agents
          .filter(({ id, enabled, mode }) => id !== primaryAgentId && enabled && mode !== "primary")
          .map(({ id }) => id) ?? [],
      ) ?? []
    if (subagentNames.includes(primaryAgentId))
      return createResultError("sessionCreate", "The global agent preset references the primary agent as a subagent.")
    if (
      subagentNames.some(
        (name) =>
          !effectiveCatalog?.agents.some(({ id, enabled, mode }) => id === name && enabled && mode !== "primary"),
      )
    )
      return createResultError("sessionCreate", "The global agent preset references an unavailable subagent.")
    const subagents = [...new Set([...subagentNames, ...projectSubagents.map(({ id }) => id)])]
      .filter((agentId) => agentId !== primaryAgentId)
      .map((agentId) => ({
        agentId,
        tools: effectiveCatalog?.agents.find(({ id }) => id === agentId)?.tools ?? { bash: false, webfetch: false },
      }))
    const resolvedPresetSelection = sessionExecutionSelectionResolve({
      catalog: effectiveCatalog,
      explicit: {
        tools: {
          primary: {
            agentId: primaryAgentId,
            tools: Object.fromEntries(
              ["bash", "webfetch", "read", "write", "edit"].map((name) => [name, toolNames.includes(name)]),
            ),
          },
          selectableSubagents: subagents,
        },
        version: 1,
      },
      primaryAgentId,
    })
    if (!resolvedPresetSelection.success) return resolvedPresetSelection
    executionSelection = resolvedPresetSelection.data
  }
  if (selectedPreset === undefined && projectSubagents.length > 0) {
    const selected = new Set(executionSelection.tools.selectableSubagents.map(({ agentId }) => agentId))
    const added = projectSubagents.filter(({ id }) => id !== primaryAgentId && !selected.has(id))
    if (added.length > 0) {
      const resolved = sessionExecutionSelectionResolve({
        catalog: effectiveCatalog,
        explicit: {
          ...executionSelection,
          tools: {
            ...executionSelection.tools,
            selectableSubagents: [
              ...executionSelection.tools.selectableSubagents,
              ...added.map(({ id, tools }) => ({ agentId: id, tools })),
            ],
          },
        },
        primaryAgentId,
      })
      if (!resolved.success) return resolved
      executionSelection = resolved.data
    }
  }
  if (commandSubtaskAgentId !== undefined) {
    const subtaskSelection = commandSubtaskSelectionValidate({
      primaryAgentId,
      selection: executionSelection,
      subtaskAgentId: commandSubtaskAgentId,
      ...(effectiveCatalog === undefined ? {} : { catalog: effectiveCatalog }),
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
    agentInstructions: effectiveInstructionSnapshot.data,
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
    catalog: effectiveCatalog,
    primaryAgentId,
    selection: executionSelection,
    skillSelection: skillSelection.data,
  })
  if (!executionManifest.success) return createResultError("sessionCreate", executionManifest.errorMessage)
  const sessionId = uuidv7()
  const {
    command: _command,
    instructionOverrides: _instructionOverrides,
    globalAgentPresetId: _globalAgentPresetId,
    modelId: _modelId,
    projectId: _projectId,
    ...repositoryInput
  } = input
  const {
    sessionModelDefault: _untrustedModelDefault,
    projectAgentCatalog: _untrustedProjectCatalog,
    globalAgentPreset: _untrustedPreset,
    ...clientMetadata
  } = input.metadata ?? {}
  const mutation = (transaction: Parameters<typeof sessionRepositoryCreate>[0]) =>
    sessionRepositoryCreate(transaction, userId, options.organizationId, {
      ...repositoryInput,
      executionManifest: executionManifest.data,
      executionSelection,
      instructionSnapshot: effectiveInstructionSnapshot.data,
      id: sessionId,
      idempotencyKey: options.idempotencyKey,
      metadata: {
        ...clientMetadata,
        ...commandMetadata,
        ...(projectCatalog.data.projectAgentIds.length === 0 ? {} : { projectAgentCatalog: effectiveCatalog }),
        ...(modelDefault?.success === true && primaryAgentId === input.primaryAgentId
          ? { sessionModelDefault: modelDefault.data }
          : {}),
        ...(selectedPreset === undefined
          ? {}
          : {
              globalAgentPreset: { id: selectedPreset.id, commandNames: [...(allowedCommandNames ?? [])].sort() },
            }),
      },
      pinned: true,
      projectPath: projectPath.data,
      projectPrimaryAgentIds: projectPrimary === undefined ? [] : [projectPrimary.id],
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
