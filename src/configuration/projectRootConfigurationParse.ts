import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type ProjectRootConfiguration, projectRootConfigurationSchema } from "./projectRootConfigurationSchema.js"

export function projectRootConfigurationParse(input: unknown): Result<ProjectRootConfiguration> {
  const op = "projectRootConfigurationParse"
  if (input === undefined) return createResult([path.resolve(os.homedir())])
  if (typeof input !== "string") return createResultError(op, "Project root configuration is invalid.")
  if (input.trim() === "") return createResult([path.resolve(os.homedir())])

  let decoded: unknown
  try {
    decoded = JSON.parse(input)
  } catch {
    return createResultError(op, "Project root configuration is invalid.")
  }

  const parsed = v.safeParse(projectRootConfigurationSchema, decoded)
  if (!parsed.success) return createResultError(op, "Project root configuration is invalid.")

  return createResult([...new Set(parsed.output.map((root) => path.resolve(root)))])
}
