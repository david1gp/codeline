import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CliCommandContext } from "./cliCommandContext.js"
import { cliConversationCreate } from "./cliConversationCreate.js"
import type { CliOptions } from "./cliOptionsResolve.js"
import { cliThemeLoad } from "./cliThemeLoad.js"
import { type CliTui, cliTuiCreate } from "./cliTuiCreate.js"

/** Owns the interactive terminal, one backend, and all signal/run cleanup. */
export async function cliInteractiveRun(
  context: CliCommandContext,
  options: CliOptions,
  onTurnError: (message: string) => void,
): Promise<Result<number>> {
  const op = "cliInteractiveRun"
  if (!context.terminal && (!process.stdin.isTTY || !process.stdout.isTTY))
    return createResultError(
      op,
      "Interactive chat requires a TTY on stdin and stdout; use 'codeline run' for piped input.",
    )
  if (options.session !== undefined && options.project !== undefined)
    return createResultError(op, "Use --project for a new session, or --session for an existing session, not both.")

  const loaded = await cliThemeLoad(options.theme ?? "dark", { ...(context.env ?? process.env) })
  if (!loaded.success) return loaded
  const token = options.backend === "local" ? undefined : (context.env ?? process.env).CODELINE_SESSION_TOKEN
  const redact = (text: string) => (token ? text.replaceAll(token, "[redacted]") : text)

  const startup = new AbortController()
  let ui: CliTui | undefined
  let conversation: Extract<Awaited<ReturnType<typeof cliConversationCreate>>, { success: true }>["data"] | undefined
  let active = false
  let closing = false
  let exitCode = 0
  let wake!: () => void
  const idle = new Promise<void>((resolve) => {
    wake = resolve
  })
  const stop = (code: number) => {
    if (closing) return
    closing = true
    exitCode = code
    startup.abort()
    conversation?.cancel()
    wake()
  }
  const interrupt = () => {
    if (closing) return
    if (!active) {
      stop(130)
      return
    }
    ui?.statusSet("Cancelling current turn…")
    conversation?.cancel()
  }
  const disposeInterrupt = context.onInterrupt?.(interrupt)
  const disposeTerminate = context.onTerminate?.(() => stop(143))
  let turn: Promise<void> | undefined
  try {
    if (closing) return createResult(exitCode)
    const opened = await (context.conversationCreate ?? cliConversationCreate)({
      options,
      context,
      signal: startup.signal,
      onSession: (id) => ui?.sessionSet(id),
    })
    if (!opened.success) {
      if (closing) return createResult(exitCode)
      return createResultError(op, redact(opened.errorMessage))
    }
    conversation = opened.data
    if (closing) return createResult(exitCode)
    const displayed = cliTuiCreate({
      theme: loaded.data,
      terminal: context.terminal,
      onCancel: interrupt,
      onSubmit: (text) => {
        if (closing || active) return
        active = true
        ui?.busySet(true)
        ui?.statusSet("Running…")
        turn = (async () => {
          let completed = false
          try {
            const result = await conversation!.prompt(text, (delta) => ui?.assistantAppend(delta))
            if (closing) return
            if (!result.success) {
              const message = redact(result.errorMessage)
              ui?.statusSet(`Error: ${message}`)
              if (result.code !== "interrupted") onTurnError(message)
              return
            }
            completed = true
            ui?.assistantComplete()
            ui?.statusSet("Ready")
          } catch (error) {
            if (!closing) {
              const message = redact(`Interactive turn failed: ${String(error)}`)
              ui?.statusSet(`Error: ${message}`)
              onTurnError(message)
            }
          } finally {
            if (!completed) ui?.assistantDiscard()
            active = false
            ui?.busySet(false)
          }
        })()
      },
    })
    if (!displayed.success) return createResultError(op, redact(displayed.errorMessage))
    ui = displayed.data
    if (conversation.sessionId()) ui.sessionSet(conversation.sessionId()!)
    if (closing) return createResult(exitCode)
    ui.start()
    await idle
    if (turn) await turn
    return createResult(exitCode)
  } catch (error) {
    return createResultError(op, redact(`Interactive terminal failed: ${String(error)}`))
  } finally {
    closing = true
    disposeInterrupt?.()
    disposeTerminate?.()
    // Pi's stop restores the prior raw-mode state. Always stop even when shutdown fails.
    try {
      if (conversation) {
        const stopped = await conversation.shutdown()
        if (!stopped.success) {
          context.process.exitCode = 1
          onTurnError(redact(stopped.errorMessage))
        }
      }
    } catch (error) {
      context.process.exitCode = 1
      onTurnError(redact(`Could not shut down the conversation: ${String(error)}`))
    } finally {
      try {
        ui?.stop()
      } catch (error) {
        context.process.exitCode = 1
        onTurnError(redact(`Could not restore the interactive terminal: ${String(error)}`))
      }
    }
  }
}
