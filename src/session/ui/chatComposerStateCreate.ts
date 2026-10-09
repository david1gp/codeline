import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useChat } from "@tanstack/ai-solid"
import { createEffect, createMemo } from "solid-js"
import type { CommandInvocation } from "../../commands/schema/commandInvocationSchema.js"
import type { CodelineExecution } from "../../providers/schema/codelineExecutionSchema.js"
import { runCancelCommand } from "../../run/client/runCancelCommand.js"
import { chatComposerStop } from "./chatComposerStop.js"
import { sessionChatConnectionCreate } from "./sessionChatConnectionCreate.js"
import { streamActivityStateCreate } from "./streamActivityStateCreate.js"
import { transientMessageActivitiesResolve } from "./transientMessageActivitiesResolve.js"
import type { TransientMessage } from "./transientMessagesResolve.js"

type ChatComposerOptions = {
  authoritativeReloadVersion?: () => number
  codelineExecution?: () => CodelineExecution | null
  /**
   * Slash-command resolution for the current draft. A blocking validation message
   * refuses submission locally, and a resolved invocation is sent as typed command
   * identity so the server expands, interpolates, and persists the digest.
   */
  command?: {
    errorMessage: () => string | undefined
    invocation: () => CommandInvocation | undefined
  }
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  runCancel?: typeof runCancelCommand
  sessionId: string
}

function chatMessageText(parts: ReadonlyArray<{ type: string; content?: unknown }>): string {
  let text = ""
  for (const part of parts) {
    if (part.type === "text" && typeof part.content === "string") text += part.content
  }
  return text
}

/**
 * Composer state for one active session. The hook is instantiated per session
 * id (the view keys on it), so navigating sessions discards the in-flight turn
 * instead of leaking it into the next conversation.
 */
export function chatComposerStateCreate(options: ChatComposerOptions) {
  const draft = createSignalObject("")
  const recoveryStatus = createSignalObject<"error" | "idle" | "recovering" | "stale" | "streaming" | "terminal">(
    "idle",
  )
  const stopError = createSignalObject<string | undefined>(undefined)
  const stopping = createSignalObject(false)
  const commandError = createSignalObject<string | undefined>(undefined)
  const manualCompactionHidden = createSignalObject(true)
  // Captured at submit time: the draft is cleared before the turn starts, so the
  // resolved invocation can no longer be derived from it when the request is sent.
  // Keep one token per submission because queued sends start after the submitting
  // call has already returned.
  const pendingCommands: Array<{ invocation?: CommandInvocation }> = []
  let manualCompactionReloadVersion = options.authoritativeReloadVersion?.()
  let runFailed = false
  const connection = sessionChatConnectionCreate({
    command: () => pendingCommands.shift()?.invocation,
    fetcher: options.fetcher,
    onStateChange: recoveryStatus.set,
    sessionId: options.sessionId,
  })
  const forwardedProps: Record<string, unknown> = {}
  const syncForwardedProps = () => {
    const execution = options.codelineExecution?.() ?? null
    if (execution === null) {
      delete forwardedProps.codelineExecution
      return
    }
    forwardedProps.codelineExecution = execution
  }
  const activity = streamActivityStateCreate()
  const chat = useChat({
    connection,
    forwardedProps,
    queue: "queue",
    onChunk: (chunk) => {
      activity.chunkObserve(chunk)
      if (chunk.type === "RUN_ERROR") runFailed = true
      if (chunk.type === "RUN_ERROR" || chunk.type === "RUN_FINISHED") manualCompactionHidden.set(true)
    },
    onError: () => {
      runFailed = true
      manualCompactionHidden.set(true)
    },
    threadId: options.sessionId,
  })
  createEffect(syncForwardedProps)
  createEffect(() => {
    const current = options.authoritativeReloadVersion?.()
    if (current === undefined || current === manualCompactionReloadVersion) return
    manualCompactionReloadVersion = current
    manualCompactionHidden.set(true)
  })

  const transientMessages = createMemo<Array<TransientMessage>>(() =>
    chat
      .messages()
      .filter((message) => message.role === "assistant" || message.role === "user")
      .map((message) => ({
        activities: transientMessageActivitiesResolve(message.parts),
        content: chatMessageText(message.parts),
        id: message.id,
        role: message.role as "assistant" | "user",
      }))
      .filter(
        (message) =>
          !(manualCompactionHidden.get() && message.role === "user" && message.content.trim() === "/compact"),
      ),
  )

  const submit = async () => {
    const preservedDraft = draft.get()
    const prompt = preservedDraft.trim()
    if (prompt.length === 0 || stopping.get()) return
    const isQueueing = chat.isLoading()
    // A command draft that cannot expand deterministically is refused here, so the
    // user keeps the draft and sees the same message the server would have returned.
    const blocking = /^\/compact(?:\s|$)/u.test(prompt) ? undefined : options.command?.errorMessage()
    if (blocking !== undefined) {
      commandError.set(blocking)
      return
    }
    const pendingCommand = { invocation: options.command?.invocation() }
    pendingCommands.push(pendingCommand)
    const isManualCompaction = prompt === "/compact"
    if (isManualCompaction) {
      manualCompactionReloadVersion = options.authoritativeReloadVersion?.()
      manualCompactionHidden.set(false)
    }
    commandError.set(undefined)
    draft.set("")
    stopError.set(undefined)
    if (!isQueueing) activity.turnReset()
    syncForwardedProps()
    try {
      await chat.sendMessage(prompt)
    } catch (error) {
      const pendingCommandIndex = pendingCommands.indexOf(pendingCommand)
      if (pendingCommandIndex >= 0) pendingCommands.splice(pendingCommandIndex, 1)
      if (isManualCompaction) manualCompactionHidden.set(true)
      draft.set(preservedDraft)
      throw error
    } finally {
      // ChatClient flushes queued sends only after the failed stream has fully
      // settled. Clear the parallel tokens at that same boundary; clearing from
      // onChunk can leave a command queued after RUN_ERROR without its discarded
      // message, allowing that token to attach to a later run.
      if (!isQueueing && runFailed) {
        pendingCommands.length = 0
        runFailed = false
      }
    }
  }

  const gracefulStopPending = createSignalObject(false)

  const localStop = () => {
    manualCompactionHidden.set(true)
    pendingCommands.length = 0
    gracefulStopPending.set(false)
    chat.stop()
  }

  const stop = () => {
    const clientRunId = chat.runId()
    const cancel = (mode: "graceful" | "immediate") =>
      (options.runCancel ?? runCancelCommand)({
        clientRunId: clientRunId ?? "",
        fetcher: options.fetcher,
        mode,
        sessionId: options.sessionId,
      })
    // A second click while a graceful stop is pending escalates to an
    // immediate abort: the in-flight tool is killed instead of completed.
    if (stopping.get() && gracefulStopPending.get()) {
      return chatComposerStop({
        cancellation: () => cancel("immediate"),
        clientRunId,
        isBusy: chat.isLoading(),
        isStopping: false,
        localStop,
        onError: stopError.set,
        onFinish: () => stopping.set(false),
        onStart: () => {
          stopError.set(undefined)
        },
      })
    }
    if (!chat.isLoading() || stopping.get() || clientRunId === null) return Promise.resolve()
    stopping.set(true)
    stopError.set(undefined)
    return cancel("graceful").then((cancelled) => {
      if (!cancelled.success) {
        stopError.set(cancelled.errorMessage)
        stopping.set(false)
        return
      }
      if (cancelled.data.deferred === true) {
        // The server finishes the in-flight tool, then ends the stream at
        // the next safe boundary. The settle effect below clears `stopping`
        // once the stream actually ends; the queued drain follows.
        gracefulStopPending.set(true)
        return
      }
      localStop()
      stopping.set(false)
    })
  }

  createEffect(() => {
    if (gracefulStopPending.get() && !chat.isLoading()) {
      gracefulStopPending.set(false)
      stopping.set(false)
    }
  })

  /**
  const queuedContentText = (content: unknown): string => {
    if (typeof content === "string") return content
    try {
      return JSON.stringify(content) ?? ""
    } catch {
      return ""
    }
  }

  const queuedMessages = () =>
    chat.queue().map((entry) => ({
      content: queuedContentText(entry.content),
      id: entry.id as string,
    }))

  const cancelQueuedMessage = (id: string) => {
    chat.cancelQueued(id)
  }

  /**
   * Promote one queued message to drain next without aborting the active
   * run. Re-queues in the new order so delivery happens at the next safe
   * boundary; other messages remain queued behind it.
   */
  const steerQueuedMessage = async (id: string): Promise<void> => {
    const current = [...chat.queue()]
    const index = current.findIndex((entry) => entry.id === id)
    if (index <= 0) return
    const target = current[index]
    if (target === undefined) return
    const reordered = [target, ...current.slice(0, index), ...current.slice(index + 1)]
    for (const entry of current) chat.cancelQueued(entry.id)
    for (const entry of reordered) {
      try {
        await chat.sendMessage(entry.content as string)
      } catch {
        break
      }
      if (!chat.isLoading()) break
    }
  }

  return {
    activity,
    cancelQueuedMessage,
    canSubmit: () =>
      draft.get().trim().length > 0 &&
      !stopping.get() &&
      (/^\/compact(?:\s|$)/u.test(draft.get().trim()) || options.command?.errorMessage() === undefined),
    draft: draft.get,
    errorMessage: () =>
      commandError.get() ?? stopError.get() ?? (recoveryStatus.get() === "stale" ? undefined : chat.error()?.message),
    isBusy: chat.isLoading,
    manualCompactionHidden: manualCompactionHidden.get,
    recoveryStatus: recoveryStatus.get,
    runId: chat.runId,
    setDraft: (value: string) => {
      commandError.set(undefined)
      draft.set(value)
    },
    isStopping: stopping.get,
    queuedMessages,
    steerQueuedMessage,
    stop,
    submit,
    transientMessages,
  }
}

export type ChatComposerState = ReturnType<typeof chatComposerStateCreate>
