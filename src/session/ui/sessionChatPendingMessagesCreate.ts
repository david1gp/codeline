import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { TransientActivity } from "./transientMessageActivitiesResolve.js"
import type { TransientMessage } from "./transientMessagesResolve.js"

type SessionChatPendingMessageView = {
  readonly activities: ReadonlyArray<TransientActivity> | undefined
  readonly content: string
  readonly id: string
  readonly isStreaming: boolean
  readonly role: "assistant" | "user"
}

type SessionChatPendingMessagesOptions = {
  isBusy: () => boolean
  messages: () => ReadonlyArray<TransientMessage>
  runId: () => string | null | undefined
}

type SessionChatPendingMessageEntry = {
  message: ReturnType<typeof createSignalObject<TransientMessage>>
  view: SessionChatPendingMessageView
}

export function sessionChatPendingMessagesCreate(options: SessionChatPendingMessagesOptions) {
  const entries = new Map<string, SessionChatPendingMessageEntry>()

  const pendingMessages = (): ReadonlyArray<SessionChatPendingMessageView> => {
    const nextEntries: SessionChatPendingMessageView[] = []
    const nextIds = new Set<string>()
    for (const message of options.messages()) {
      if (nextIds.has(message.id)) continue
      nextIds.add(message.id)
      const entry = entries.get(message.id) ?? sessionChatPendingMessageEntryCreate(message, options)
      entry.message.set(message)
      entries.set(message.id, entry)
      nextEntries.push(entry.view)
    }

    for (const id of entries.keys()) {
      if (!nextIds.has(id)) entries.delete(id)
    }
    return nextEntries
  }

  return { pendingMessages }
}

function sessionChatPendingMessageEntryCreate(
  message: TransientMessage,
  options: SessionChatPendingMessagesOptions,
): SessionChatPendingMessageEntry {
  const current = createSignalObject(message)
  const view: SessionChatPendingMessageView = {
    get activities() {
      return current.get().activities
    },
    get content() {
      return current.get().content
    },
    id: message.id,
    get isStreaming() {
      const next = current.get()
      const runId = options.runId()
      return (
        options.isBusy() &&
        next.role === "assistant" &&
        runId !== null &&
        runId !== undefined &&
        next.id === `assistant-${runId}`
      )
    },
    get role() {
      return current.get().role
    },
  }
  return { message: current, view }
}
