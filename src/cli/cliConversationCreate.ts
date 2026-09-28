import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { cliBackendAcquire } from "./cliBackendAcquire.js"
import type { CliCommandContext } from "./cliCommandContext.js"
import type { CliOptions } from "./cliOptionsResolve.js"
import { cliServerRun } from "./cliServerRun.js"

type CliConversationOptions = {
  options: CliOptions
  context: Pick<CliCommandContext, "cwd" | "env" | "fetch" | "localRuntimeCreate" | "pollingDelay">
  signal?: AbortSignal
  onSession?: (sessionId: string) => void
}

export async function cliConversationCreate({ options, context, signal, onSession }: CliConversationOptions) {
  const acquired = await cliBackendAcquire({ options, context, signal })
  if (!acquired.success) return acquired
  const backend = acquired.data
  let sessionId = options.session
  let active: { controller: AbortController; task: Promise<Result<void>> } | undefined
  let shutdownPromise: Promise<Result<void>> | undefined

  return createResult({
    sessionId: () => sessionId,
    prompt: async (text: string, onText: (delta: string) => void): Promise<Result<void>> => {
      const op = "cliConversationPrompt"
      if (shutdownPromise !== undefined) return createResultError(op, "The conversation is closed.")
      if (active !== undefined) return createResultError(op, "A conversation run is already active.")
      const controller = new AbortController()
      const task = cliServerRun(backend.transport, {
        ...backend.runOptions,
        ...(sessionId === undefined ? {} : { session: sessionId, project: undefined, projectPath: undefined }),
        prompt: text,
        onText,
        onSession: (id) => {
          sessionId = id
          onSession?.(id)
        },
        pollingDelay: context.pollingDelay,
        signal: controller.signal,
      })
      active = { controller, task }
      try {
        return await task
      } finally {
        active = undefined
      }
    },
    cancel: () => active?.controller.abort(),
    shutdown: (): Promise<Result<void>> => {
      if (shutdownPromise !== undefined) return shutdownPromise
      active?.controller.abort()
      shutdownPromise = (async () => {
        // Admission uses a separate bounded signal; wait for it and cancellation before releasing local SQLite.
        if (active !== undefined) await active.task.catch(() => undefined)
        return backend.shutdown()
      })()
      return shutdownPromise
    },
  })
}
