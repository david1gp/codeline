import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type CliConfig, cliConfigSchema } from "./cliConfigSchema.js"

export async function cliConfigRead(path: string): Promise<Result<CliConfig>> {
  const op = "cliConfigRead"
  let content: string
  try {
    content = await Bun.file(path).text()
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return createResult({})
    return createResultError(op, `Could not read CLI config at ${path}.`)
  }

  let input: unknown
  try {
    input = JSON.parse(content)
  } catch {
    return createResultError(op, `CLI config at ${path} is not valid JSON.`)
  }
  const parsed = v.safeParse(cliConfigSchema, input)
  if (!parsed.success) return createResultError(op, `CLI config at ${path} has invalid fields.`)
  return createResult(parsed.output)
}
