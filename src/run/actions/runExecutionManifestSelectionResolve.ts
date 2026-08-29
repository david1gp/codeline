import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { commandSubtaskSelectionValidate } from "../../commands/actions/commandSubtaskSelectionValidate.js"
import { commandExecutionManifestSchema } from "../../commands/schema/commandExecutionManifestSchema.js"
import type { AgentToolDefaults } from "../../agents/schema/agentToolDefaultsSchema.js"
import { agentInstructionsSnapshotResolve } from "../../instructions/actions/agentInstructionsSnapshotResolve.js"
import type { AgentInstructionsResolvedSnapshot } from "../../instructions/schema/agentInstructionsResolvedSnapshotSchema.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { sessionExecutionSelectionSchema } from "../../session/schema/sessionExecutionSelectionSchema.js"
import { skillDescriptionCatalogRender } from "../../skills/actions/skillDescriptionCatalogRender.js"
import { skillSelectionSchema } from "../../skills/schema/skillSelectionSchema.js"
import type { ToolName } from "../../tools/schema/toolNameSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunExecutionManifest, runExecutionManifestSchema } from "../schema/runExecutionManifestSchema.js"

function runExecutionManifestSelectionToolsResolve(tools: AgentToolDefaults): ToolName[] {
  return [
    ...(tools.bash ? ["bash" as const] : []),
    ...(tools.webfetch ? ["webfetch" as const] : []),
    ...(tools.read ? ["read" as const] : []),
    ...(tools.write ? ["write" as const] : []),
    ...(tools.edit ? ["edit" as const] : []),
    "skill",
    "delegate_task",
  ]
}

function runExecutionManifestDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) runExecutionManifestDeepFreeze(child)
  return value
}

function runExecutionManifestCommandResolve(
  input: unknown,
): Result<v.InferOutput<typeof commandExecutionManifestSchema> | undefined> {
  if (input === undefined) return createResult(undefined)
  const parsed = v.safeParse(commandExecutionManifestSchema, input)
  if (!parsed.success)
    return runResultCreateError(
      "runExecutionManifestSelectionResolve",
      "The command execution manifest is invalid.",
      runErrorCodes.executionSnapshotInvalid,
    )
  return createResult(parsed.output)
}

export function runExecutionManifestSelectionResolve(input: {
  agentInstructions?: unknown
  catalog?: ProviderCatalog
  command?: unknown
  commandCatalogDigest?: string | null
  primaryAgentId: string
  selection: unknown
  skillSelection?: unknown
}): Result<RunExecutionManifest> {
  const op = "runExecutionManifestSelectionResolve"
  const parsed = v.safeParse(sessionExecutionSelectionSchema, input.selection)
  if (!parsed.success)
    return runResultCreateError(
      op,
      "The session execution selection is invalid.",
      runErrorCodes.executionSnapshotInvalid,
    )
  if (parsed.output.tools.primary.agentId !== input.primaryAgentId)
    return runResultCreateError(
      op,
      "The session execution selection primary agent does not match the run target.",
      runErrorCodes.executionSnapshotInvalid,
    )

  const command = runExecutionManifestCommandResolve(input.command)
  if (!command.success) return command
  if (command.data?.subtask === true) {
    const subtaskSelection = commandSubtaskSelectionValidate({
      ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
      primaryAgentId: input.primaryAgentId,
      selection: parsed.output,
      subtaskAgentId: command.data.agent ?? input.primaryAgentId,
    })
    if (!subtaskSelection.success)
      return runResultCreateError(op, subtaskSelection.errorMessage, runErrorCodes.executionSnapshotInvalid)
  }

  let instructions: AgentInstructionsResolvedSnapshot = { snapshots: [], version: 1 }
  if (input.agentInstructions !== undefined) {
    const resolvedInstructions = agentInstructionsSnapshotResolve(input.agentInstructions)
    if (!resolvedInstructions.success)
      return runResultCreateError(
        op,
        "The agent instruction snapshot is invalid.",
        runErrorCodes.executionSnapshotInvalid,
      )
    instructions = resolvedInstructions.data
  }

  let skills: { descriptionCatalog?: unknown; presetName?: string; snapshots: unknown[]; version: 1 } = {
    snapshots: [],
    version: 1,
  }
  if (input.skillSelection !== undefined) {
    const parsedSkillSelection = v.safeParse(skillSelectionSchema, input.skillSelection)
    if (!parsedSkillSelection.success)
      return runResultCreateError(op, "The session skill selection is invalid.", runErrorCodes.executionSnapshotInvalid)
    const descriptionCatalog = skillDescriptionCatalogRender(parsedSkillSelection.output)
    if (!descriptionCatalog.success)
      return runResultCreateError(
        op,
        "The skill description catalog is invalid.",
        runErrorCodes.executionSnapshotInvalid,
      )
    skills = {
      descriptionCatalog: descriptionCatalog.data,
      presetName: parsedSkillSelection.output.presetName,
      snapshots: parsedSkillSelection.output.activeSkills.map((snapshot) => structuredClone(snapshot)),
      version: 1,
    }
  }

  const manifest = {
    commandCatalog: { digest: input.commandCatalogDigest ?? null, version: 1 as const },
    ...(command.data === undefined ? {} : { command: command.data }),
    instructions,
    skills,
    tools: {
      primary: {
        agentId: parsed.output.tools.primary.agentId,
        tools: runExecutionManifestSelectionToolsResolve(parsed.output.tools.primary.tools),
      },
      selectableSubagents: parsed.output.tools.selectableSubagents.map(({ agentId, tools }) => ({
        agentId,
        tools: runExecutionManifestSelectionToolsResolve(tools),
      })),
    },
    version: 1 as const,
  }
  const validated = v.safeParse(runExecutionManifestSchema, manifest)
  if (!validated.success)
    return runResultCreateError(op, "The run execution manifest is invalid.", runErrorCodes.executionSnapshotInvalid)
  return createResult(runExecutionManifestDeepFreeze(structuredClone(validated.output)))
}
