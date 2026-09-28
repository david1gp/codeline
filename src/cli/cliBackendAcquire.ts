import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectRootConfigurationParse } from "../configuration/projectRootConfigurationParse.js"
import type { CliCommandContext } from "./cliCommandContext.js"
import { cliLocalRuntimeCreate } from "./cliLocalRuntimeCreate.js"
import type { CliOptions } from "./cliOptionsResolve.js"
import { cliServerTransportCreate } from "./cliServerTransportCreate.js"

type CliBackendAcquireOptions = {
  options: CliOptions
  context: Pick<CliCommandContext, "cwd" | "env" | "fetch" | "localRuntimeCreate">
  signal?: AbortSignal
}

export async function cliBackendAcquire({ options, context, signal }: CliBackendAcquireOptions) {
  const op = "cliBackendAcquire"
  if (signal?.aborted) return createResultError(op, "Interrupted before opening the backend.")
  const local = options.backend === "local"
  const token = local ? undefined : (context.env ?? process.env).CODELINE_SESSION_TOKEN
  if (!local && !token)
    return createResultError(
      op,
      "Remote run requires temporary CODELINE_SESSION_TOKEN environment cookie authentication.",
    )
  if (options.session !== undefined && options.project !== undefined)
    return createResultError(op, "Use --project for a new session, or --session for an existing session, not both.")

  let runtime: Extract<Awaited<ReturnType<typeof cliLocalRuntimeCreate>>, { success: true }>["data"] | undefined
  if (local) {
    const environment = { ...(context.env ?? process.env) }
    let project = options.project
    if (options.session !== undefined) {
      // Continuation selects its project from the persisted session, not the caller's cwd.
      const home = environment.HOME && isAbsolute(environment.HOME) ? environment.HOME : homedir()
      const roots = projectRootConfigurationParse(
        environment.CODELINE_PROJECT_ROOTS?.trim() ? environment.CODELINE_PROJECT_ROOTS : JSON.stringify([home]),
      )
      if (!roots.success) return roots
      project = resolve(context.cwd ?? process.cwd(), roots.data[0]!)
    }
    const created = await (context.localRuntimeCreate ?? cliLocalRuntimeCreate)({
      cwd: context.cwd,
      project,
      environment,
    })
    if (!created.success) return created
    runtime = created.data
  }
  if (signal?.aborted) {
    if (runtime !== undefined) {
      const stopped = await runtime.shutdown()
      if (!stopped.success) return stopped
    }
    return createResultError(op, "Interrupted before opening the backend.")
  }
  const transport =
    options.backend === "local"
      ? cliServerTransportCreate({ local: true, fetch: (input, init) => runtime!.fetch(new Request(input, init)) })
      : cliServerTransportCreate({ baseUrl: options.backend.serverUrl, sessionToken: token!, fetch: context.fetch })
  if (!transport.success) {
    if (runtime !== undefined) {
      const stopped = await runtime.shutdown()
      if (!stopped.success) return stopped
    }
    return transport
  }
  return createResult({
    transport: transport.data,
    runOptions: local
      ? {
          ...(options.session === undefined ? { projectPath: runtime!.projectPath } : {}),
          target: runtime!.target,
        }
      : { project: options.project },
    shutdown: (): Promise<Result<void>> => runtime?.shutdown() ?? Promise.resolve(createResult(undefined)),
  })
}
