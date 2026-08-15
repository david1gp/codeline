import type { SessionChatState } from "./sessionChatStateCreate.js"
import type { finalizedMessageCopyStateCreate } from "../message/ui/finalizedMessageCopyStateCreate.js"
import type { sessionRenameControlStateCreate } from "../session/ui/sessionRenameControlStateCreate.js"
import type { sessionWatchToggleStateCreate } from "./sessionWatchToggleStateCreate.js"

export type SelectedSessionViewMessage = {
  copyState: ReturnType<typeof finalizedMessageCopyStateCreate>
  content: string
  role: string
}

export type SelectedSessionViewSession = {
  id: string
  title: string
}

/**
 * Rendering contract of the selected session view, so production Zero state and
 * demo fixtures can supply the same shape without the view knowing the source.
 */
export type SelectedSessionView = {
  chatCreate: (sessionId: string) => SessionChatState
  hasSelection: () => boolean
  initialChat: SessionChatState
  isInitialChatVisible: () => boolean
  isMessagesEmpty: () => boolean
  isMessagesError: () => boolean
  isMessagesLoading: () => boolean
  isMessagesRefreshing: () => boolean
  isSessionError: () => boolean
  isSessionLoading: () => boolean
  messages: () => ReadonlyArray<SelectedSessionViewMessage>
  renameState: () => ReturnType<typeof sessionRenameControlStateCreate> | undefined
  watchState: () => ReturnType<typeof sessionWatchToggleStateCreate> | undefined
  retryMessages: () => void
  retrySession: () => void
  session: () => SelectedSessionViewSession | undefined
}
