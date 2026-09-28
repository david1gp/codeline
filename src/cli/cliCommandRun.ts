import { cliBackendAcquire } from "./cliBackendAcquire.js"
import type { CliCommandContext } from "./cliCommandContext.js"
import type { CliFlags } from "./cliCommandOptions.js"
import { cliConfigPathResolve } from "./cliConfigPathResolve.js"
import { cliConfigRead } from "./cliConfigRead.js"
import { cliInteractiveRun } from "./cliInteractiveRun.js"
import { cliOptionsResolve } from "./cliOptionsResolve.js"
import { cliServerRun } from "./cliServerRun.js"

export async function cliCommandRun(
  context: CliCommandContext,
  flags: CliFlags,
  mode: "interactive" | "run",
  prompt?: string,
): Promise<void> {
  const path = context.configPath || cliConfigPathResolve({ ...(context.env ?? process.env) })
  const config = await cliConfigRead(path)
  if (!config.success) {
    context.process.stderr.write(`${config.errorMessage}\n`)
    context.process.exitCode = 1
    return
  }

  const options = cliOptionsResolve(config.data, flags)
  if (!options.success) {
    context.process.stderr.write(`${options.errorMessage}\n`)
    context.process.exitCode = 1
    return
  }

  const token = options.data.backend === "local" ? undefined : (context.env ?? process.env).CODELINE_SESSION_TOKEN
  const failureWrite = (message: string, exitCode: number) => {
    context.process.stderr.write(`${token ? message.replaceAll(token, "[redacted]") : message}\n`)
    context.process.exitCode = exitCode
  }
  if (mode === "interactive") {
    const result = await cliInteractiveRun(context, options.data, (message) => {
      context.process.stderr.write(`${token ? message.replaceAll(token, "[redacted]") : message}\n`)
    })
    if (!result.success) failureWrite(result.errorMessage, 1)
    else if (context.process.exitCode !== 1) context.process.exitCode = result.data
    return
  }
  const controller = new AbortController()
  const dispose = context.onInterrupt?.(() => controller.abort())
  let backend: Extract<Awaited<ReturnType<typeof cliBackendAcquire>>, { success: true }>["data"] | undefined
  try {
    const acquired = await cliBackendAcquire({ context, options: options.data, signal: controller.signal })
    if (!acquired.success) {
      failureWrite(acquired.errorMessage, controller.signal.aborted ? 130 : 1)
      return
    }
    backend = acquired.data
    const result = await cliServerRun(backend.transport, {
      prompt: prompt ?? "",
      ...backend.runOptions,
      session: options.data.session,
      onText: (text) => context.process.stdout.write(text),
      pollingDelay: context.pollingDelay,
      signal: controller.signal,
    })
    if (!result.success) {
      failureWrite(result.errorMessage, controller.signal.aborted ? 130 : 1)
      return
    }
    context.process.exitCode = 0
  } finally {
    dispose?.()
    if (backend !== undefined) {
      const stopped = await backend.shutdown()
      if (!stopped.success) failureWrite(stopped.errorMessage, 1)
    }
  }
}
