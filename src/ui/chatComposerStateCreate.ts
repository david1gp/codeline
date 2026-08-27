import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useChat } from "@tanstack/ai-solid"
import { createEffect, createMemo } from "solid-js"
import type { CommandInvocation } from "../commands/schema/commandInvocationSchema.js"
import type { CodelineExecution } from "../providers/schema/codelineExecutionSchema.js"
import { runCancelCommand } from "../run/client/runCancelCommand.js"
import { chatComposerStop } from "./chatComposerStop.js"
import { sessionChatConnectionCreate } from "./sessionChatConnectionCreate.js"
import { streamActivityStateCreate } from "./streamActivityStateCreate.js"
import { transientMessageActivitiesResolve } from "./transientMessageActivitiesResolve.js"
import type { TransientMessage } from "./transientMessagesResolve.js"

type ChatComposerOptions = {
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
  // Captured at submit time: the draft is cleared before the turn starts, so the
  // resolved invocation can no longer be derived from it when the request is sent.
  let pendingCommand: CommandInvocation | undefined
  const connection = sessionChatConnectionCreate({
    command: () => pendingCommand,
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
    onChunk: activity.chunkObserve,
    threadId: options.sessionId,
  })
  createEffect(syncForwardedProps)

  const transientMessages = createMemo<Array<TransientMessage>>(() =>
    chat
      .messages()
      .filter((message) => message.role === "assistant" || message.role === "user")
      .map((message) => ({
        activities: transientMessageActivitiesResolve(message.parts),
        content: chatMessageText(message.parts),
        id: message.id,
        role: message.role as "assistant" | "user",
      })),
  )

  const submit = async () => {
    const preservedDraft = draft.get()
    const prompt = preservedDraft.trim()
    if (prompt.length === 0 || chat.isLoading() || stopping.get()) return
    // A command draft that cannot expand deterministically is refused here, so the
    // user keeps the draft and sees the same message the server would have returned.
    const blocking = options.command?.errorMessage()
    if (blocking !== undefined) {
      commandError.set(blocking)
      return
    }
    pendingCommand = options.command?.invocation()
    commandError.set(undefined)
    draft.set("")
    stopError.set(undefined)
    activity.turnReset()
    syncForwardedProps()
    try {
      await chat.sendMessage(prompt, { whenBusy: "drop" })
    } catch (error) {
      draft.set(preservedDraft)
      throw error
    } finally {
      pendingCommand = undefined
    }
  }

  const stop = () => {
    const clientRunId = chat.runId()
    return chatComposerStop({
      cancellation: () =>
        (options.runCancel ?? runCancelCommand)({
          clientRunId: clientRunId ?? "",
          fetcher: options.fetcher,
          sessionId: options.sessionId,
        }),
      clientRunId,
      isBusy: chat.isLoading(),
      isStopping: stopping.get(),
      localStop: chat.stop,
      onError: stopError.set,
      onFinish: () => stopping.set(false),
      onStart: () => {
        stopping.set(true)
        stopError.set(undefined)
      },
    })
  }

  return {
    activity,
    canSubmit: () =>
      draft.get().trim().length > 0 && !chat.isLoading() && options.command?.errorMessage() === undefined,
    draft: draft.get,
    errorMessage: () =>
      commandError.get() ?? stopError.get() ?? (recoveryStatus.get() === "stale" ? undefined : chat.error()?.message),
    isBusy: chat.isLoading,
    recoveryStatus: recoveryStatus.get,
    runId: chat.runId,
    setDraft: (value: string) => {
      commandError.set(undefined)
      draft.set(value)
    },
    isStopping: stopping.get,
    stop,
    submit,
    transientMessages,
  }
}

export type ChatComposerState = ReturnType<typeof chatComposerStateCreate>
