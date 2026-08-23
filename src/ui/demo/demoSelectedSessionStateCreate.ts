import { finalizedMessageCopyStateCreate } from "../../message/ui/finalizedMessageCopyStateCreate.js"
import { sessionRenameControlStateCreate } from "../../session/ui/sessionRenameControlStateCreate.js"
import type { SelectedSessionView } from "../selectedSessionView.js"
import { sessionDisplayModeStateCreate } from "../sessionDisplayModeStateCreate.js"
import { sessionPinToggleStateCreate } from "../sessionPinToggleStateCreate.js"
import { sessionSubagentThreadStateCreate } from "../sessionSubagentThreadStateCreate.js"
import { demoSessionChatStateCreate } from "./demoSessionChatStateCreate.js"
import { demoSessionMessagesFixture } from "./demoSessionMessagesFixture.js"
import { demoSessionRenameFetch } from "./demoSessionRenameFetch.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoSessionStreamGroupsFixture } from "./demoSessionStreamGroupsFixture.js"
import { demoWorkspaceSessionsFixture } from "./demoWorkspaceSessionsFixture.js"

type DemoSelectedSessionStateOptions = {
  selectedSessionId: { get: () => string | null }
  rightPanelClose: () => void
  rightPanelShow: () => void
  variant: () => DemoSessionScreenVariant
}

export function demoSelectedSessionStateCreate(options: DemoSelectedSessionStateOptions): SelectedSessionView {
  const displayMode = sessionDisplayModeStateCreate()
  const subagentThread = sessionSubagentThreadStateCreate({
    rightPanelClose: options.rightPanelClose,
    rightPanelShow: options.rightPanelShow,
    sessionId: options.selectedSessionId.get,
  })
  const chat = demoSessionChatStateCreate(options.variant)
  const copyStates = new Map<string, ReturnType<typeof finalizedMessageCopyStateCreate>>()
  const renameStates = new Map<string, ReturnType<typeof sessionRenameControlStateCreate>>()
  const pinStates = new Map<string, ReturnType<typeof sessionPinToggleStateCreate>>()
  const session = () => {
    if (options.variant() === "empty") return undefined
    const sessionId = options.selectedSessionId.get()
    const current = demoWorkspaceSessionsFixture.find((candidate) => candidate.id === sessionId)
    return current === undefined ? undefined : { ...current, pinned: true }
  }
  const pinState = () => {
    const current = session()
    if (!current) return undefined
    const existing = pinStates.get(current.id)
    if (existing) return existing
    const created = sessionPinToggleStateCreate({
      fetcher: async () => Response.json({ session: current }),
      pinned: () => current.pinned,
      sessionId: () => current.id,
    })
    pinStates.set(current.id, created)
    return created
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
    displayMode,
    hasSelection: () => options.variant() !== "empty" && options.selectedSessionId.get() !== null,
    initialChat: chat,
    isInitialChatVisible: () => options.selectedSessionId.get() === null,
    isMessagesEmpty: () => messages().length === 0,
    isMessagesError: () => options.variant() === "error",
    isMessagesLoading: () => options.variant() === "loading",
    isMessagesRefreshing: () => options.variant() === "streaming",
    isSessionError: () => false,
    isSessionLoading: () => options.variant() === "loading",
    messages,
    readOnlyNotice: () => undefined,
    readOnlyReason: () => null,
    refresh: () => undefined,
    revalidate: () => undefined,
    renameState,
    retryMessages: () => undefined,
    retrySession: () => undefined,
    streamGroups: () => demoSessionStreamGroupsFixture,
    isStreamLoading: () => options.variant() === "loading",
    session,
    pinState,
    subagentThread,
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
