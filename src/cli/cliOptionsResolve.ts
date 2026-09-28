import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type CliConfig, cliConfigSchema } from "./cliConfigSchema.js"

const backendSchema = v.union([v.literal("local"), v.pipe(v.string(), v.url())])

export type CliOptions = {
  backend: "local" | { serverUrl: string }
  session?: string
  project?: string
  theme?: string
}

export type CliOptionOverrides = {
  backend?: string
  session?: string
  project?: string
  theme?: string
}

export function cliOptionsResolve(config: CliConfig, overrides: CliOptionOverrides): Result<CliOptions> {
  const op = "cliOptionsResolve"
  const selectedBackend = overrides.backend ?? config.backend ?? "local"
  const parsedBackend = v.safeParse(backendSchema, selectedBackend)
  if (!parsedBackend.success) return createResultError(op, "Backend must be 'local' or a valid server URL.")

  const effective = {
    backend: parsedBackend.output,
    session: overrides.session ?? config.session,
    project: overrides.project ?? config.project,
    theme: overrides.theme ?? config.theme,
  }
  const validated = v.safeParse(cliConfigSchema, {
    backend: effective.backend,
    ...(effective.session === undefined ? {} : { session: effective.session }),
    ...(effective.project === undefined ? {} : { project: effective.project }),
    ...(effective.theme === undefined ? {} : { theme: effective.theme }),
  })
  if (!validated.success) return createResultError(op, "CLI options contain invalid values.")

  const { backend, ...options } = validated.output
  return createResult({
    backend: backend === undefined || backend === "local" ? "local" : { serverUrl: backend },
    ...options,
  })
}
