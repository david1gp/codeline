import type { SelectedSessionView } from "../selectedSessionView.js"
import { finalizedMessageCopyStateCreate } from "../../message/ui/finalizedMessageCopyStateCreate.js"
import { sessionRenameControlStateCreate } from "../../session/ui/sessionRenameControlStateCreate.js"
import { demoSessionChatStateCreate } from "./demoSessionChatStateCreate.js"
import { demoSessionMessagesFixture } from "./demoSessionMessagesFixture.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoSessionRenameFetch } from "./demoSessionRenameFetch.js"
import { demoWorkspaceSessionsFixture } from "./demoWorkspaceSessionsFixture.js"

type DemoSelectedSessionStateOptions = {
  selectedSessionId: { get: () => string | null }
  variant: () => DemoSessionScreenVariant
}

export function demoSelectedSessionStateCreate(options: DemoSelectedSessionStateOptions): SelectedSessionView {
  const chat = demoSessionChatStateCreate(options.variant)
  const copyStates = new Map<string, ReturnType<typeof finalizedMessageCopyStateCreate>>()
  const renameStates = new Map<string, ReturnType<typeof sessionRenameControlStateCreate>>()
  const session = () => {
    if (options.variant() === "empty") return undefined
    const sessionId = options.selectedSessionId.get()
    return demoWorkspaceSessionsFixture.find((candidate) => candidate.id === sessionId)
  }
  const messages = () =>
    options.variant() === "ready" || options.variant() === "streaming"
      ? demoSessionMessagesFixture.map((message, index) => ({
          ...message,
          copyState: copyStates.get(String(index)) ?? copyStateCreate(copyStates, String(index), message.content),
        }))
      : []
  const renameState = () => {
    const current = session()
    if (!current) return undefined
    const existing = renameStates.get(current.id)
    if (existing) return existing
    const created = sessionRenameControlStateCreate({
      fetcher: demoSessionRenameFetch,
      sessionId: () => current.id,
      title: () => current.title,
    })
    renameStates.set(current.id, created)
    return created
  }

  return {
    chatCreate: () => chat,
    hasSelection: () => options.variant() !== "empty" && options.selectedSessionId.get() !== null,
    isMessagesEmpty: () => messages().length === 0,
    isMessagesError: () => options.variant() === "error",
    isMessagesLoading: () => options.variant() === "loading",
    isMessagesRefreshing: () => options.variant() === "streaming",
    isSessionError: () => false,
    isSessionLoading: () => options.variant() === "loading",
    messages,
    renameState,
    retryMessages: () => undefined,
    retrySession: () => undefined,
    session,
  }
}

function copyStateCreate(
  states: Map<string, ReturnType<typeof finalizedMessageCopyStateCreate>>,
  id: string,
  content: string,
) {
  const state = finalizedMessageCopyStateCreate({ content: () => content, writeText: async () => undefined })
  states.set(id, state)
  return state
}
