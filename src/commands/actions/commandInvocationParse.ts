import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type CommandInvocation, commandInvocationSchema } from "../schema/commandInvocationSchema.js"
import { commandNameSchema } from "../schema/commandNameSchema.js"

export function commandInvocationParse(input: string): Result<CommandInvocation | null> {
  const op = "commandInvocationParse"
  if (typeof input !== "string" || input.includes("\0") || input.length > 100_000)
    return createResultError(op, "The command invocation is invalid.")
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) return createResult(null)
  const match = /^\/([^\s]+)(?:[\t ]+([\s\S]*))?$/u.exec(trimmed)
  if (match === null) return createResultError(op, "The command invocation is invalid.")
  const parsedName = v.safeParse(commandNameSchema, match[1])
  if (!parsedName.success) return createResultError(op, "The command name is invalid.")
  const parsed = v.safeParse(commandInvocationSchema, {
    name: parsedName.output,
    arguments: match[2] ?? "",
  })
  if (!parsed.success) return createResultError(op, "The command invocation is invalid.")
  return createResult(parsed.output)
}
