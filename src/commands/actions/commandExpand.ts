import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { commandDigestSchema } from "../schema/commandDigestSchema.js"
import type { CommandExpansion } from "../schema/commandExpansionSchema.js"
import { commandExpansionSchema } from "../schema/commandExpansionSchema.js"
import type { CommandSnapshot } from "../schema/commandSnapshotSchema.js"
import { commandSnapshotSchema } from "../schema/commandSnapshotSchema.js"
import { commandArgumentsTokenize } from "./commandArgumentsTokenize.js"
import { commandTemplateExpand } from "./commandTemplateExpand.js"

export type CommandExpandInput = {
  arguments?: readonly string[] | string
  catalogDigest?: string
  command: unknown
}

export function commandExpand(input: CommandExpandInput): Result<CommandExpansion> {
  const op = "commandExpand"
  const command = v.safeParse(commandSnapshotSchema, input.command)
  if (!command.success) return createResultError(op, "The command snapshot is invalid.")
  if (input.catalogDigest !== undefined && !v.safeParse(commandDigestSchema, input.catalogDigest).success)
    return createResultError(op, "The command catalog digest is invalid.")
  const argumentsResult = commandArgumentsTokenize(input.arguments)
  if (!argumentsResult.success) return createResultError(op, argumentsResult.errorMessage)
  const expandedText = commandTemplateExpand(
    command.output.body,
    argumentsResult.data.text,
    argumentsResult.data.values,
  )
  if (!expandedText.success) return createResultError(op, expandedText.errorMessage)
  const snapshot: CommandSnapshot = command.output
  const expansion = {
    arguments: argumentsResult.data.values,
    argumentsText: argumentsResult.data.text,
    ...(input.catalogDigest === undefined ? {} : { catalogDigest: input.catalogDigest }),
    commandName: snapshot.name,
    expandedText: expandedText.data,
    overrides: {
      ...(snapshot.agent === undefined ? {} : { agent: snapshot.agent }),
      ...(snapshot.model === undefined ? {} : { model: snapshot.model }),
      ...(snapshot.subtask === undefined ? {} : { subtask: snapshot.subtask }),
    },
    templateDigest: snapshot.templateDigest,
    version: 1 as const,
  }
  const parsed = v.safeParse(commandExpansionSchema, expansion)
  if (!parsed.success) return createResultError(op, "The expanded command is invalid.")
  return createResult(parsed.output)
}
