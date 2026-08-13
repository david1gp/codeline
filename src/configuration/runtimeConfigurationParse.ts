import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { runtimeConfigurationSchema, type RuntimeConfiguration } from "./runtimeConfigurationSchema.js"

export function runtimeConfigurationParse(input: unknown): Result<RuntimeConfiguration> {
  const op = "runtimeConfigurationParse"
  const parsed = v.safeParse(runtimeConfigurationSchema, input)

  if (!parsed.success) {
    const fields = parsed.issues
      .map((issue) => issue.path?.at(-1)?.key)
      .filter((field): field is string => typeof field === "string")
    const uniqueFields = [...new Set(fields)]
    const suffix = uniqueFields.length > 0 ? ` Invalid fields: ${uniqueFields.join(", ")}.` : ""
    return createResultError(op, `Runtime configuration is invalid.${suffix}`)
  }

  if (parsed.output.nodeEnv === "development" && parsed.output.developmentIdentity === undefined) {
    return createResultError(op, "Runtime configuration is invalid. Invalid fields: developmentIdentity.")
  }

  return createResult(parsed.output)
}
